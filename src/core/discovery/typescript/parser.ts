import ts from "typescript";
import type {
	ClassInfo,
	ClassMethodInfo,
	ClassPropertyInfo,
	FunctionInfo,
	ParameterInfo,
	ParsedFile,
} from "../../../types/discovery";
import { AbstractParser } from "../../../types/discovery";
import type { Result } from "../../../types/misc";
import { ParserFactory } from "../function-parser-factory";

type ParseContext = {
	program: ts.Program;
	typeChecker: ts.TypeChecker;
	sourceFile: ts.SourceFile;
};

export class TypeScriptParser extends AbstractParser {
	parseFile(filePath: string): Result<ParsedFile<ts.SourceFile>> {
		try {
			const options: ts.CompilerOptions = {
				target: ts.ScriptTarget.Latest,
				module: ts.ModuleKind.ESNext,
				allowJs: true,
				skipLibCheck: true,
				noResolve: false,
			};

			const program = ts.createProgram([filePath], options);
			const sourceFile = program.getSourceFile(filePath);

			if (!sourceFile) {
				throw new Error(`Could not create source file for ${filePath}`);
			}

			this.validateParseResult(sourceFile);

			return {
				ok: true,
				value: {
					filePath,
					ast: sourceFile,
					language: "typescript",
				},
			};
		} catch (error) {
			return this.createErrorResult(error);
		}
	}

	/**
	 * parseContent behaves like "parseFile" but for an in-memory file.
	 * It still creates a full Program/TypeChecker so inference works.
	 */
	parseContent(
		content: string,
		fileName: string = "temp.ts",
	): Result<ParsedFile<ts.SourceFile>> {
		try {
			const options: ts.CompilerOptions = {
				target: ts.ScriptTarget.Latest,
				module: ts.ModuleKind.ESNext,
				allowJs: true,
				skipLibCheck: true,
				noResolve: false,
			};

			// Create an in-memory CompilerHost that returns our content for fileName
			const defaultHost = ts.createCompilerHost(
				options,
				/*setParentNodes*/ true,
			);
			const memoryFiles = new Map<string, string>([[fileName, content]]);

			const host: ts.CompilerHost = {
				...defaultHost,
				fileExists: (f) => memoryFiles.has(f) || defaultHost.fileExists(f),
				readFile: (f) => memoryFiles.get(f) ?? defaultHost.readFile(f),
				getSourceFile: (
					f,
					languageVersion,
					onError,
					shouldCreateNewSourceFile,
				) => {
					const mem = memoryFiles.get(f);
					if (mem !== undefined) {
						return ts.createSourceFile(
							f,
							mem,
							languageVersion,
							true,
							ts.ScriptKind.TS,
						);
					}
					return defaultHost.getSourceFile(
						f,
						languageVersion,
						onError,
						shouldCreateNewSourceFile,
					);
				},
				// Ensure our root file has a "real" path (helps module resolution)
				getCanonicalFileName: (f) => defaultHost.getCanonicalFileName(f),
				getCurrentDirectory: () => defaultHost.getCurrentDirectory(),
				getNewLine: () => defaultHost.getNewLine(),
				useCaseSensitiveFileNames: () =>
					defaultHost.useCaseSensitiveFileNames(),
				writeFile: defaultHost.writeFile,
				getDefaultLibFileName: (o) => defaultHost.getDefaultLibFileName(o),
				getDirectories: (path) =>
					defaultHost.getDirectories ? defaultHost.getDirectories(path) : [],
			};

			const program = ts.createProgram([fileName], options, host);
			const sourceFile = program.getSourceFile(fileName);

			if (!sourceFile) {
				throw new Error(`Could not create source file for ${fileName}`);
			}

			this.validateParseResult(sourceFile);

			return {
				ok: true,
				value: {
					filePath: fileName,
					ast: sourceFile,
					language: "typescript",
				},
			};
		} catch (error) {
			return this.createErrorResult(error);
		}
	}

	/**
	 * Extract functions (top-level + public class methods).
	 * No shared mutable state; everything is threaded via a local ParseContext.
	 */
	extractFunctions(
		parsedFile: ParsedFile<ts.SourceFile>,
	): Result<readonly FunctionInfo[]> {
		try {
			// Build a minimal program around this one file to enable type inference
			const fileName = parsedFile.filePath;
			const sourceText = parsedFile.ast.getFullText();
			const inMem = this.parseContent(sourceText, fileName);
			if (!inMem.ok) {
				return { ok: false, error: inMem.error };
			}

			const program = ts.createProgram(
				[fileName],
				{
					target: ts.ScriptTarget.Latest,
					module: ts.ModuleKind.ESNext,
					allowJs: true,
					skipLibCheck: true,
					noResolve: false,
				},
				this.buildMirrorHost(fileName, sourceText),
			);
			const sourceFile = program.getSourceFile(fileName);
			const typeChecker = program.getTypeChecker();

			if (!sourceFile) {
				throw new Error("Source file is undefined");
			}

			const ctx: ParseContext = { program, typeChecker, sourceFile };

			const functions: FunctionInfo[] = [];

			const visit = (node: ts.Node, insideClass = false) => {
				// Handle class declarations
				if (ts.isClassDeclaration(node) && node.name) {
					const currentClassName = node.name.getText();
					const classInfo = this.extractClassInfo(ctx, node);

					// Visit class members with class context
					node.members.forEach((member) => {
						if (
							this.isFunctionLikeNode(member) &&
							this.isPublicOrExportedMethod(ctx, member)
						) {
							const fn = this.getFunction(
								ctx,
								member,
								currentClassName,
								classInfo,
							);
							functions.push(fn);
						}
					});

					return; // don't double-traverse class members
				}

				// Handle regular functions (not inside classes)
				if (
					this.isFunctionLikeNode(node) &&
					!insideClass &&
					this.isTopLevelFunction(node)
				) {
					const fn = this.getFunction(ctx, node);
					functions.push(fn);
				}

				ts.forEachChild(node, (child) =>
					visit(child, insideClass || ts.isClassDeclaration(node)),
				);
			};

			visit(sourceFile);
			return { ok: true, value: functions };
		} catch (error) {
			return this.createErrorResult(error);
		}
	}

	// ----------------- Pure helpers (no instance state) -----------------

	private isFunctionLikeNode(
		node: ts.Node,
	): node is
		| ts.FunctionDeclaration
		| ts.MethodDeclaration
		| ts.FunctionExpression
		| ts.ArrowFunction {
		return (
			ts.isFunctionDeclaration(node) ||
			ts.isMethodDeclaration(node) ||
			ts.isFunctionExpression(node) ||
			ts.isArrowFunction(node)
		);
	}

	private getImplementation(sourceFile: ts.SourceFile, node: ts.Node): string {
		return node.getText(sourceFile).trim();
	}

	private getReturnType(
		ctx: ParseContext,
		node:
			| ts.FunctionDeclaration
			| ts.MethodDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction,
	): string | undefined {
		// Explicit annotation first
		if (node.type) {
			return node.type.getText();
		}
		// Infer using type checker
		try {
			const sig = ctx.typeChecker.getSignatureFromDeclaration(node);
			if (sig) {
				const t = ctx.typeChecker.getReturnTypeOfSignature(sig);
				return ctx.typeChecker.typeToString(t);
			}
		} catch {
			// ignore
		}
		return undefined;
	}

	private getFunction(
		ctx: ParseContext,
		node:
			| ts.FunctionDeclaration
			| ts.MethodDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction,
		className?: string,
		classInfo?: ClassInfo,
	): FunctionInfo {
		const functionName = this.getFunctionName(node);
		const displayName = className
			? `${className}.${functionName}`
			: functionName;

		const functionInfo: FunctionInfo = {
			name: displayName,
			filePath: ctx.sourceFile.fileName,
			implementation: this.getImplementation(ctx.sourceFile, node),
			parameters: this.getFunctionParameters(ctx, node),
			returnType: this.getReturnType(ctx, node),
			isAsync: this.isAsyncFunction(node),
			jsDoc: this.getJsDoc(ctx, node),
		};

		if (classInfo) {
			(functionInfo as any).classContext = classInfo;
		}

		return functionInfo;
	}

	private isAsyncFunction(
		node:
			| ts.FunctionDeclaration
			| ts.MethodDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction,
	): boolean {
		return !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
	}

	private getFunctionParameters(
		ctx: ParseContext,
		node:
			| ts.FunctionDeclaration
			| ts.MethodDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction,
	): readonly ParameterInfo[] {
		return node.parameters.map((param) => {
			const name = param.name.getText();
			const type =
				param.type?.getText() ??
				this.getParameterTypeFromTypeChecker(ctx, param);
			const optional = !!param.questionToken;
			const defaultValue = param.initializer
				? param.initializer.getText()
				: undefined;

			return { name, type, optional, defaultValue };
		});
	}

	private getParameterTypeFromTypeChecker(
		ctx: ParseContext,
		param: ts.ParameterDeclaration,
	): string | undefined {
		try {
			const type = ctx.typeChecker.getTypeAtLocation(param);
			return ctx.typeChecker.typeToString(type);
		} catch {
			return undefined;
		}
	}

	private getFunctionName(
		node:
			| ts.FunctionDeclaration
			| ts.MethodDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction,
	): string {
		if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
			return node.name?.getText() || "anonymous";
		}
		if (ts.isFunctionExpression(node)) {
			return node.name?.getText() || "anonymous";
		}
		// Arrow function -> try variable/property name
		if (ts.isArrowFunction(node)) {
			const parent = node.parent;
			if (ts.isVariableDeclaration(parent)) return parent.name.getText();
			if (ts.isPropertyAssignment(parent)) return parent.name.getText();
			return "anonymous";
		}
		return "anonymous";
	}

	getSupportedExtensions(): readonly string[] {
		return [".ts", ".tsx", ".js", ".jsx"];
	}

	getName(): string {
		return "TypeScript";
	}

	private validateParseResult(sourceFile: ts.SourceFile): void {
		const diagnostics = (sourceFile as any).parseDiagnostics;
		if (diagnostics?.length > 0) {
			const errors = diagnostics
				.map((d: ts.Diagnostic) =>
					ts.flattenDiagnosticMessageText(d.messageText, "\n"),
				)
				.join("\n");
			throw new Error(`TypeScript parsing errors: ${errors}`);
		}
	}

	/**
	 * Extract class information including properties and method signatures,
	 * recursively including inherited members from parent classes.
	 */
	private extractClassInfo(
		ctx: ParseContext,
		classNode: ts.ClassDeclaration,
	): ClassInfo {
		const className = classNode.name?.getText() || "anonymous";
		const properties: ClassPropertyInfo[] = [];
		const methods: ClassMethodInfo[] = [];

		const classJsDoc = this.getJsDoc(ctx, classNode);

		classNode.members.forEach((member) => {
			if (ts.isPropertyDeclaration(member)) {
				const property = this.extractPropertyInfo(member);
				if (property) properties.push(property);
			} else if (this.isFunctionLikeNode(member)) {
				const method = this.extractMethodInfo(ctx, member);
				if (method) methods.push(method);
			}
		});

		// Inheritance
		if (classNode.heritageClauses) {
			for (const heritageClause of classNode.heritageClauses) {
				if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
					for (const heritageType of heritageClause.types) {
						const parentClassInfo = this.extractParentClassInfo(
							ctx,
							heritageType,
						);
						if (parentClassInfo) {
							properties.unshift(...parentClassInfo.properties);
							methods.unshift(...parentClassInfo.methods);
						}
					}
				}
			}
		}

		return { name: className, properties, methods, jsDoc: classJsDoc };
	}

	/**
	 * Extract parent class information recursively
	 */
	private extractParentClassInfo(
		ctx: ParseContext,
		heritageType: ts.ExpressionWithTypeArguments,
	): ClassInfo | null {
		try {
			const parentClassName = heritageType.expression.getText();
			const parentNode = this.findClassDeclaration(
				ctx.sourceFile,
				parentClassName,
			);
			if (parentNode) {
				return this.extractClassInfo(ctx, parentNode);
			}
			// Not found locally; try type info
			const type = ctx.typeChecker.getTypeAtLocation(heritageType);
			return this.extractClassInfoFromType(ctx, type, parentClassName);
		} catch {
			return null;
		}
	}

	/**
	 * Find a class declaration by name in the given source file
	 */
	private findClassDeclaration(
		sourceFile: ts.SourceFile,
		className: string,
	): ts.ClassDeclaration | null {
		const visit = (node: ts.Node): ts.ClassDeclaration | null => {
			if (ts.isClassDeclaration(node) && node.name?.getText() === className) {
				return node;
			}
			for (const child of node.getChildren()) {
				const res = visit(child);
				if (res) return res;
			}
			return null;
		};
		return visit(sourceFile);
	}

	/**
	 * Extract basic class info from TypeScript type information
	 */
	private extractClassInfoFromType(
		ctx: ParseContext,
		type: ts.Type,
		className: string,
	): ClassInfo {
		const properties: ClassPropertyInfo[] = [];
		const methods: ClassMethodInfo[] = [];

		for (const symbol of type.getProperties()) {
			const name = symbol.getName();
			const valueDecl = symbol.valueDeclaration;

			if (valueDecl && ts.isPropertySignature(valueDecl)) {
				properties.push({
					name,
					type: undefined,
					isPrivate: false,
					isStatic: false,
					isReadonly: false,
				});
			} else if (valueDecl && ts.isMethodSignature(valueDecl)) {
				methods.push({
					name,
					parameters: [],
					returnType: undefined,
					isAsync: false,
					isPrivate: false,
					isStatic: false,
					jsDoc: undefined,
				});
			} else if (valueDecl && ts.isMethodDeclaration(valueDecl)) {
				// Cover the case where declaration is a MethodDeclaration
				const params = this.getFunctionParameters(ctx, valueDecl);
				const ret = this.getReturnType(ctx, valueDecl);
				methods.push({
					name,
					parameters: params,
					returnType: ret,
					isAsync: this.isAsyncFunction(valueDecl),
					isPrivate: !!valueDecl.modifiers?.some(
						(m) => m.kind === ts.SyntaxKind.PrivateKeyword,
					),
					isStatic: !!valueDecl.modifiers?.some(
						(m) => m.kind === ts.SyntaxKind.StaticKeyword,
					),
					jsDoc: this.getJsDoc(ctx, valueDecl),
				});
			}
		}

		return { name: className, properties, methods, jsDoc: undefined };
	}

	/**
	 * Extract property information from a property declaration
	 */
	private extractPropertyInfo(
		node: ts.PropertyDeclaration,
	): ClassPropertyInfo | null {
		const name = node.name?.getText();
		if (!name) return null;

		const type = node.type?.getText();
		const isPrivate =
			node.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword) ??
			false;
		const isStatic =
			node.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ??
			false;
		const isReadonly =
			node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) ??
			false;

		return { name, type, isPrivate, isStatic, isReadonly };
	}

	/**
	 * Extract method signature information (not implementation)
	 */
	private extractMethodInfo(
		ctx: ParseContext,
		node: ts.Node,
	): ClassMethodInfo | null {
		if (!this.isFunctionLikeNode(node)) return null;

		const methodNode = node as ts.MethodDeclaration;
		const name = this.getFunctionNameFromNode(node);

		const parameters = this.getFunctionParameters(ctx, methodNode);
		const returnType = this.getReturnType(ctx, methodNode);
		const isAsync = this.isAsyncFunction(methodNode as any);
		const jsDoc = this.getJsDoc(ctx, node);

		const isPrivate =
			methodNode.modifiers?.some(
				(m) => m.kind === ts.SyntaxKind.PrivateKeyword,
			) ?? false;
		const isStatic =
			methodNode.modifiers?.some(
				(m) => m.kind === ts.SyntaxKind.StaticKeyword,
			) ?? false;

		return {
			name,
			parameters,
			returnType,
			isAsync,
			isPrivate,
			isStatic,
			jsDoc,
		};
	}

	private getJsDoc(ctx: ParseContext, node: ts.Node): string | undefined {
		const jsDocComments = ts.getJSDocCommentsAndTags(node);
		const jsDocTexts: string[] = [];
		for (const jsDoc of jsDocComments) {
			if (ts.isJSDoc(jsDoc)) {
				const fullText = jsDoc.getFullText(ctx.sourceFile);
				jsDocTexts.push(fullText.trim());
			}
		}
		return jsDocTexts.length > 0 ? jsDocTexts.join("\n") : undefined;
	}

	/**
	 * Public (or allowed) class method filter.
	 * For non-methods, returns true (so top-level fns pass through other checks).
	 */
	private isPublicOrExportedMethod(_ctx: ParseContext, node: ts.Node): boolean {
		if (!ts.isMethodDeclaration(node)) {
			return true;
		}
		const hasPrivate = node.modifiers?.some(
			(m) => m.kind === ts.SyntaxKind.PrivateKeyword,
		);
		if (hasPrivate) return false;

		const methodName = this.getFunctionNameFromNode(node);
		if (methodName.startsWith("_")) return false;

		return true;
	}

	/**
	 * Top-level functions worth extracting (exclude anonymous callbacks).
	 */
	private isTopLevelFunction(node: ts.Node): boolean {
		const functionName = this.getFunctionNameFromNode(node);
		if (functionName === "anonymous") return false;

		if (ts.isFunctionDeclaration(node)) {
			return true;
		}

		if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
			const parent = node.parent;
			if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Get function name from any node, without shared state.
	 */
	private getFunctionNameFromNode(node: ts.Node): string {
		const fn = node as
			| ts.FunctionDeclaration
			| ts.MethodDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction;
		return this.getFunctionName(fn);
	}

	private buildMirrorHost(fileName: string, content: string): ts.CompilerHost {
		const options: ts.CompilerOptions = {
			target: ts.ScriptTarget.Latest,
			module: ts.ModuleKind.ESNext,
			allowJs: true,
			skipLibCheck: true,
			noResolve: false,
		};
		const defaultHost = ts.createCompilerHost(options, /*setParentNodes*/ true);
		const mem = new Map([[fileName, content]]);
		return {
			...defaultHost,
			fileExists: (f) => mem.has(f) || defaultHost.fileExists(f),
			readFile: (f) => mem.get(f) ?? defaultHost.readFile(f),
			getSourceFile: (f, langVer, onError, shouldCreateNewSourceFile) => {
				const txt = mem.get(f);
				if (txt !== undefined) {
					return ts.createSourceFile(f, txt, langVer, true, ts.ScriptKind.TS);
				}
				return defaultHost.getSourceFile(
					f,
					langVer,
					onError,
					shouldCreateNewSourceFile,
				);
			},
			getCanonicalFileName: (f) => defaultHost.getCanonicalFileName(f),
			getCurrentDirectory: () => defaultHost.getCurrentDirectory(),
			getNewLine: () => defaultHost.getNewLine(),
			useCaseSensitiveFileNames: () => defaultHost.useCaseSensitiveFileNames(),
			writeFile: defaultHost.writeFile,
			getDefaultLibFileName: (o) => defaultHost.getDefaultLibFileName(o),
			getDirectories: (path) =>
				defaultHost.getDirectories ? defaultHost.getDirectories(path) : [],
		};
	}

	private createErrorResult(error: unknown): Result<never> {
		return {
			ok: false,
			error: error instanceof Error ? error : new Error(String(error)),
		};
	}
}

ParserFactory.getInstance().registerParser(new TypeScriptParser());
