import ts from "typescript";
import type {
	FunctionInfo,
	ParameterInfo,
	ParsedFile,
} from "../../../types/discovery";
import { AbstractParser } from "../../../types/discovery";
import type { Result } from "../../../types/misc";
import { ParserFactory } from "../function-parser-factory";

export class TypeScriptParser extends AbstractParser {
	private program?: ts.Program;
	private typeChecker?: ts.TypeChecker;
	private sourceFile: ts.SourceFile | undefined;
	private currentNode?: ts.Node;

	parseFile(filePath: string): Result<ParsedFile<ts.SourceFile>> {
		try {
			this.program = ts.createProgram([filePath], {
				target: ts.ScriptTarget.Latest,
				module: ts.ModuleKind.ESNext,
				allowJs: true,
				skipLibCheck: true,
				noResolve: false,
			});

			this.typeChecker = this.program.getTypeChecker();
			this.sourceFile = this.program.getSourceFile(filePath);

			if (!this.sourceFile) {
				throw new Error(`Could not create source file for ${filePath}`);
			}

			this.validateParseResult(this.sourceFile);

			return {
				ok: true,
				value: {
					filePath,
					ast: this.sourceFile,
					language: "typescript",
				},
			};
		} catch (error) {
			return this.createErrorResult(error);
		}
	}

	parseContent(
		content: string,
		fileName: string = "temp.ts",
	): Result<ParsedFile<ts.SourceFile>> {
		try {
			this.sourceFile = ts.createSourceFile(
				fileName,
				content,
				ts.ScriptTarget.Latest,
				true,
				ts.ScriptKind.TS,
			);

			this.validateParseResult(this.sourceFile);

			return {
				ok: true,
				value: {
					filePath: fileName,
					ast: this.sourceFile,
					language: "typescript",
				},
			};
		} catch (error) {
			return this.createErrorResult(error);
		}
	}

	/**
	 * In the future we can pass in options to control which functions should be included
	 * @param parsedFile ts source file
	 * @returns
	 */
	extractFunctions(
		parsedFile: ParsedFile<ts.SourceFile>,
	): Result<readonly FunctionInfo[]> {
		try {
			const functions: FunctionInfo[] = [];
			this.sourceFile = parsedFile.ast;

			const visit = (node: ts.Node) => {
				if (this.isFunctionLikeNode(node)) {
					this.currentNode = node;
					const functionInfo = this.getFunction();
					functions.push(functionInfo);
				}
				ts.forEachChild(node, visit);
			};

			visit(this.sourceFile);
			return { ok: true, value: functions };
		} catch (error) {
			return this.createErrorResult(error);
		}
	}

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

	private getJsDoc(): string | undefined {
		if (!this.currentNode || !this.sourceFile) {
			return undefined;
		}

		const functionNode = this.currentNode as
			| ts.FunctionDeclaration
			| ts.MethodDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction;

		// Get JSDoc comments using ts.getJSDocCommentsAndTags
		const jsDocComments = ts.getJSDocCommentsAndTags(functionNode);

		if (jsDocComments.length === 0) {
			return undefined;
		}

		// Extract the actual JSDoc text
		const jsDocTexts: string[] = [];

		for (const jsDoc of jsDocComments) {
			if (ts.isJSDoc(jsDoc)) {
				// Get the full text of the JSDoc comment
				const fullText = jsDoc.getFullText(this.sourceFile);
				jsDocTexts.push(fullText.trim());
			}
		}

		return jsDocTexts.length > 0 ? jsDocTexts.join("\n") : undefined;
	}

	private getImplementation(): string {
		if (!this.currentNode || !this.sourceFile) {
			return "";
		}

		// Use getText() instead of getFullText() to exclude leading trivia (JSDoc comments)
		return this.currentNode.getText(this.sourceFile).trim();
	}

	private getReturnType(): string | undefined {
		if (!this.currentNode) {
			return undefined;
		}

		const functionNode = this.currentNode as
			| ts.FunctionDeclaration
			| ts.MethodDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction;

		// First try to get explicit return type annotation
		if (functionNode.type) {
			return functionNode.type.getText();
		}

		// If no explicit return type, try to infer it using type checker
		if (this.typeChecker) {
			try {
				const signature =
					this.typeChecker.getSignatureFromDeclaration(functionNode);
				if (signature) {
					const returnType =
						this.typeChecker.getReturnTypeOfSignature(signature);
					return this.typeChecker.typeToString(returnType);
				}
			} catch {
				// Fallback to undefined if type checking fails
			}
		}

		return undefined;
	}

	private getFunction(): FunctionInfo {
		if (!this.currentNode || !this.sourceFile) {
			throw new Error("No current node or source file available");
		}

		const functionNode = this.currentNode as
			| ts.FunctionDeclaration
			| ts.MethodDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction;

		return {
			name: this.getFunctionName(),
			filePath: this.sourceFile.fileName,
			implementation: this.getImplementation(),
			parameters: this.getFunctionParameters(),
			returnType: this.getReturnType(),
			isAsync: this.isAsyncFunction(functionNode),
			jsDoc: this.getJsDoc(),
		};
	}

	private isAsyncFunction(
		node:
			| ts.FunctionDeclaration
			| ts.MethodDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction,
	): boolean {
		return !!node.modifiers?.some(
			(modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
		);
	}

	private getFunctionParameters(): readonly ParameterInfo[] {
		if (!this.currentNode) {
			return [];
		}

		const functionNode = this.currentNode as
			| ts.FunctionDeclaration
			| ts.MethodDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction;

		return functionNode.parameters.map((param) => {
			const name = param.name.getText();
			const type = param.type
				? param.type.getText()
				: this.getParameterTypeFromTypeChecker(param);
			const optional = !!param.questionToken;
			const defaultValue = param.initializer
				? param.initializer.getText()
				: undefined;

			return {
				name,
				type,
				optional,
				defaultValue,
			};
		});
	}

	private getParameterTypeFromTypeChecker(
		param: ts.ParameterDeclaration,
	): string | undefined {
		if (!this.typeChecker) {
			return undefined;
		}

		try {
			const type = this.typeChecker.getTypeAtLocation(param);
			return this.typeChecker.typeToString(type);
		} catch {
			return undefined;
		}
	}

	private getFunctionName(): string {
		if (!this.currentNode) {
			return "anonymous";
		}

		const functionNode = this.currentNode as
			| ts.FunctionDeclaration
			| ts.MethodDeclaration
			| ts.FunctionExpression
			| ts.ArrowFunction;

		if (
			ts.isFunctionDeclaration(functionNode) ||
			ts.isMethodDeclaration(functionNode)
		) {
			return functionNode.name?.getText() || "anonymous";
		}

		if (ts.isFunctionExpression(functionNode)) {
			return functionNode.name?.getText() || "anonymous";
		}

		// For arrow functions, try to get name from variable declaration
		if (ts.isArrowFunction(functionNode)) {
			const parent = functionNode.parent;
			if (ts.isVariableDeclaration(parent)) {
				return parent.name.getText();
			}
			if (ts.isPropertyAssignment(parent)) {
				return parent.name.getText();
			}
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
		const diagnostics = sourceFile.parseDiagnostics;
		if (diagnostics?.length > 0) {
			const errors = diagnostics
				.map((diagnostic: ts.Diagnostic) =>
					ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
				)
				.join("\n");
			throw new Error(`TypeScript parsing errors: ${errors}`);
		}
	}

	private createErrorResult(error: unknown): Result<never> {
		return {
			ok: false,
			error: error instanceof Error ? error : new Error(String(error)),
		};
	}
}

ParserFactory.getInstance().registerParser(new TypeScriptParser());

