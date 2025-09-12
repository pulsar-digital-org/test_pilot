import { basename, dirname, extname } from "node:path";
import type { FunctionInfo } from "../../types/discovery";
import type { Result } from "../../types/misc";
import type { ImportInfo } from "./import-resolver";
import { ImportResolver } from "./import-resolver";
import type {
	FunctionContext,
	GeneratedPrompt,
	IContextBuilder,
	IPromptGenerator,
	SystemPromptContext,
} from "./types";

export class ContextBuilder implements IContextBuilder {
	private readonly importResolver: ImportResolver;

	constructor(private readonly promptGenerator: IPromptGenerator) {
		this.importResolver = new ImportResolver();
	}

	buildFunctionContext(
		func: FunctionInfo,
		imports?: ImportInfo,
	): FunctionContext {
		const context: FunctionContext = {
			function: func,
		};

		if (imports) {
			context.imports = imports;
		}

		return context;
	}

	buildSystemPrompt(
		functions: readonly FunctionInfo[],
		testOutputPath?: string,
	): Result<GeneratedPrompt> {
		try {
			// Build function contexts with import information
			const functionContexts = functions.map((func) => {
				let imports: ImportInfo | undefined;

				if (testOutputPath) {
					// Create a test file path for this specific function
					const testFileName = generateTestFileName(func.filePath, func.name);
					const fullTestPath = testOutputPath.endsWith(testFileName)
						? testOutputPath
						: `${testOutputPath}/${testFileName}`;

					imports = this.importResolver.resolveImports(
						func.filePath,
						func.name,
						fullTestPath,
					);
				}

				return this.buildFunctionContext(func, imports);
			});

			const systemPromptContext: SystemPromptContext = {
				functions: functionContexts,
			};

			// Generate prompts
			const systemPromptResult =
				this.promptGenerator.generateSystemPrompt(systemPromptContext);
			const userPromptResult =
				this.promptGenerator.generateUserPrompt(systemPromptContext);

			if (!systemPromptResult.ok) {
				return { ok: false, error: systemPromptResult.error };
			}
			if (!userPromptResult.ok) {
				return { ok: false, error: userPromptResult.error };
			}

			const generatedPrompt: GeneratedPrompt = {
				systemPrompt: systemPromptResult.value,
				userPrompt: userPromptResult.value,
				context: systemPromptContext,
				metadata: {
					generatedAt: new Date(),
					functionsCount: functions.length,
				},
			};

			return { ok: true, value: generatedPrompt };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}
}

// Helper function for generating test file names (shared with generate command)
function generateTestFileName(
	originalPath: string,
	functionName: string,
): string {
	const baseName = basename(originalPath, extname(originalPath));
	const dir = dirname(originalPath).replace(/^\.\//, "").replace(/\//g, "-");
	return `${dir ? `${dir}-` : ""}${baseName}-${functionName}.test.ts`;
}

