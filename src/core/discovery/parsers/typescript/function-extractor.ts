import ts from "typescript";
import { FunctionExtractionError } from "../../errors";
import type {
	DiscoveryOptions,
	FunctionInfo,
	ParsedFile,
} from "../../types/core";
import { ClassAnalyzer } from "./class-analyzer";
import { ArrowFunctionExtractor } from "./extractors/arrow-function-extractor";
import type { ParseContext } from "./extractors/base-extractor";
import { FunctionDeclarationExtractor } from "./extractors/function-declaration-extractor";
import { MethodDeclarationExtractor } from "./extractors/method-declaration-extractor";
import { TypeGuards } from "./type-guards";

export class FunctionExtractor {
	private extractors = [
		new FunctionDeclarationExtractor(),
		new MethodDeclarationExtractor(),
		new ArrowFunctionExtractor(),
	];

	private classAnalyzer = new ClassAnalyzer();

	constructor(private options: Required<DiscoveryOptions>) {}

	extractFunctions(
		parsedFile: ParsedFile<ts.SourceFile>,
	): readonly FunctionInfo[] {
		try {
			const context = this.createParseContext(parsedFile);
			const functions: FunctionInfo[] = [];

			const visit = (node: ts.Node, insideClass = false) => {
				try {
					// Handle class declarations
					if (
						ts.isClassDeclaration(node) &&
						node.name &&
						this.options.includeClassMethods
					) {
						const classInfo = this.classAnalyzer.analyzeClass(node, context);

						// Visit class members with class context
						node.members.forEach((member) => {
							if (
								TypeGuards.isFunctionLike(member) &&
								ts.isMethodDeclaration(member)
							) {
								const methodExtractor = this.extractors.find((e) =>
									e.canHandle(member),
								) as MethodDeclarationExtractor;
								if (methodExtractor) {
									const fn = methodExtractor.extract(
										member,
										context,
										classInfo,
									);
									if (fn) functions.push(fn);
								}
							}
						});
						return; // don't traverse class members again
					}

					// Handle regular functions (not inside classes)
					if (TypeGuards.isFunctionLike(node) && !insideClass) {
						// Apply filtering based on options
						if (
							ts.isArrowFunction(node) &&
							!this.options.includeArrowFunctions
						) {
							return;
						}

						if (
							!TypeGuards.isTopLevelFunction(node) &&
							!this.options.includeAnonymousFunctions
						) {
							return;
						}

						const extractor = this.extractors.find((e) => e.canHandle(node));
						if (extractor) {
							const fn = extractor.extract(node, context);
							if (fn) functions.push(fn);
						}
					}

					ts.forEachChild(node, (child) =>
						visit(child, insideClass || ts.isClassDeclaration(node)),
					);
				} catch (error) {
					const functionName = TypeGuards.getFunctionName(node);
					throw new FunctionExtractionError(
						error instanceof Error ? error.message : String(error),
						functionName,
						parsedFile.filePath,
						error instanceof Error ? error : undefined,
					);
				}
			};

			visit(context.sourceFile);
			return functions;
		} catch (error) {
			if (error instanceof FunctionExtractionError) {
				throw error;
			}
			throw new FunctionExtractionError(
				error instanceof Error ? error.message : String(error),
				"unknown",
				parsedFile.filePath,
				error instanceof Error ? error : undefined,
			);
		}
	}

	private createParseContext(
		parsedFile: ParsedFile<ts.SourceFile>,
	): ParseContext {
		const fileName = parsedFile.filePath;
		const sourceText = parsedFile.ast.getFullText();

		// Create a minimal program for type inference
		const compilerOptions: ts.CompilerOptions = {
			target: ts.ScriptTarget.Latest,
			module: ts.ModuleKind.ESNext,
			allowJs: true,
			skipLibCheck: true,
			noResolve: false,
		};

		const program = ts.createProgram(
			[fileName],
			compilerOptions,
			this.createMemoryHost(fileName, sourceText),
		);
		const sourceFile = program.getSourceFile(fileName);
		const typeChecker = program.getTypeChecker();

		if (!sourceFile) {
			throw new Error("Source file is undefined");
		}

		return { program, typeChecker, sourceFile };
	}

	private createMemoryHost(fileName: string, content: string): ts.CompilerHost {
		const defaultHost = ts.createCompilerHost(
			{
				target: ts.ScriptTarget.Latest,
				module: ts.ModuleKind.ESNext,
				allowJs: true,
				skipLibCheck: true,
				noResolve: false,
			},
			true,
		);

		const memoryFiles = new Map([[fileName, content]]);

		return {
			...defaultHost,
			fileExists: (f) => memoryFiles.has(f) || defaultHost.fileExists(f),
			readFile: (f) => memoryFiles.get(f) ?? defaultHost.readFile(f),
			getSourceFile: (f, langVer, onError, shouldCreateNewSourceFile) => {
				const text = memoryFiles.get(f);
				if (text !== undefined) {
					return ts.createSourceFile(f, text, langVer, true, ts.ScriptKind.TS);
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
}

