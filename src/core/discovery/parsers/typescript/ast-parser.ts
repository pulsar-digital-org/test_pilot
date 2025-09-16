import ts from "typescript";
import { ParseError } from "../../errors";
import type { ParsedFile } from "../../types/core";

interface CompilerConfig {
	target: ts.ScriptTarget;
	module: ts.ModuleKind;
	allowJs: boolean;
	skipLibCheck: boolean;
	noResolve: boolean;
}

const DEFAULT_COMPILER_CONFIG: CompilerConfig = {
	target: ts.ScriptTarget.Latest,
	module: ts.ModuleKind.ESNext,
	allowJs: true,
	skipLibCheck: true,
	noResolve: false,
};

export class TypeScriptASTParser {
	constructor(private config: CompilerConfig = DEFAULT_COMPILER_CONFIG) {}

	parseFile(filePath: string): ParsedFile<ts.SourceFile> {
		try {
			const program = ts.createProgram([filePath], this.config);
			const sourceFile = program.getSourceFile(filePath);

			if (!sourceFile) {
				throw new ParseError(`Could not create source file`, filePath);
			}

			const sourceFileWithParents = ts.createSourceFile(
				filePath,
				sourceFile.getFullText(),
				this.config.target,
				true, // setParentNodes
			);

			this.validateParseResult(sourceFile);

			return {
				filePath,
				ast: sourceFileWithParents,
				language: "typescript",
			};
		} catch (error) {
			if (error instanceof ParseError) {
				throw error;
			}
			throw new ParseError(
				error instanceof Error ? error.message : String(error),
				filePath,
				error instanceof Error ? error : undefined,
			);
		}
	}

	parseContent(
		content: string,
		fileName: string = "temp.ts",
	): ParsedFile<ts.SourceFile> {
		try {
			const defaultHost = ts.createCompilerHost(this.config, true);
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

			const program = ts.createProgram([fileName], this.config, host);
			const sourceFile = program.getSourceFile(fileName);

			if (!sourceFile) {
				throw new ParseError(`Could not create source file`, fileName);
			}

			const sourceFileWithParents = ts.createSourceFile(
				fileName,
				sourceFile.getFullText(),
				this.config.target,
				true,
			);

			this.validateParseResult(sourceFile);

			return {
				filePath: fileName,
				ast: sourceFileWithParents,
				language: "typescript",
			};
		} catch (error) {
			if (error instanceof ParseError) {
				throw error;
			}
			throw new ParseError(
				error instanceof Error ? error.message : String(error),
				fileName,
				error instanceof Error ? error : undefined,
			);
		}
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
}

