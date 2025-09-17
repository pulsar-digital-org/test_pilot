import { basename, dirname, extname, join } from "node:path";
import type { EnhancedFunctionInfo, FunctionAnalysis } from "../analysis/types";
import type { FunctionInfo } from "../../types/discovery";
import type { Result } from "../../types/misc";
import { ImportResolver } from "./import-resolver";
import type {
	BuildContextOptions,
	FunctionContext,
	GeneratedPrompt,
	IContextBuilder,
	IPromptGenerator,
	SystemPromptContext,
} from "./types";

export class ContextBuilder implements IContextBuilder {
	private readonly importResolver: ImportResolver;
	private functions: readonly FunctionInfo[] = [];
	private readonly functionsByKey = new Map<string, FunctionInfo>();
	private readonly analysisByKey = new Map<string, FunctionAnalysis>();
	private defaultTestDirectory?: string;

	constructor(
		private readonly promptGenerator: IPromptGenerator,
		dependencies: { importResolver?: ImportResolver } = {},
	) {
		this.importResolver = dependencies.importResolver ?? new ImportResolver();
	}

	withFunctions(functions: readonly FunctionInfo[]): IContextBuilder {
		this.functions = functions;
		this.functionsByKey.clear();
		for (const func of functions) {
			this.functionsByKey.set(this.getFunctionKey(func), func);
		}
		return this;
	}

	withAnalysis(functions: readonly EnhancedFunctionInfo[]): IContextBuilder {
		this.analysisByKey.clear();
		for (const func of functions) {
			const key = this.getFunctionKey(func);
			if (!this.functionsByKey.has(key)) {
				this.functionsByKey.set(key, func);
			}
			if (func.analysis) {
				this.analysisByKey.set(key, func.analysis);
			}
		}
		return this;
	}

	withDefaultTestDirectory(directory: string): IContextBuilder {
		this.defaultTestDirectory = directory;
		return this;
	}

	buildForFunction(
		func: FunctionInfo,
		options?: BuildContextOptions,
	): Result<GeneratedPrompt> {
		return this.buildSystemPrompt([func], options);
	}

	buildFunctionContext(
		func: FunctionInfo,
		options?: BuildContextOptions,
	): FunctionContext {
		const testFilePath = options?.testFilePath;
		const imports = testFilePath
			? this.importResolver.resolveImports(
					func.filePath,
					func.name,
					testFilePath,
				)
			: undefined;
		const analysis = this.analysisByKey.get(this.getFunctionKey(func));

		const context: FunctionContext = {
			function: func,
		};

		if (imports) {
			context.imports = imports;
		}
		if (analysis) {
			context.analysis = analysis;
		}

		return context;
	}

	buildSystemPrompt(
		functions: readonly FunctionInfo[],
		optionsOrPath?: BuildContextOptions | string,
	): Result<GeneratedPrompt> {
		try {
			const options = this.normalizeOptions(optionsOrPath);
			const treatFilePathAsExact = functions.length === 1;

			const functionContexts = functions.map((func) => {
				const testFilePath = this.resolveTestFilePath(
					func,
					options,
					treatFilePathAsExact,
				);
				return this.buildFunctionContext(func, {
					testFilePath,
				});
			});

			const systemPromptContext: SystemPromptContext = {
				functions: functionContexts,
			};

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

	private normalizeOptions(
		optionsOrPath?: BuildContextOptions | string,
	): BuildContextOptions {
		if (!optionsOrPath) {
			return {};
		}

		if (typeof optionsOrPath === "string") {
			return { testFilePath: optionsOrPath };
		}

		return optionsOrPath;
	}

	private resolveTestFilePath(
		func: FunctionInfo,
		options: BuildContextOptions,
		treatAsExactFile: boolean,
	): string | undefined {
		const testFileName = generateTestFileName(func.filePath, func.name);

		if (options.testFilePath) {
			if (
				treatAsExactFile &&
				basename(options.testFilePath) === testFileName
			) {
				return options.testFilePath;
			}

			return join(options.testFilePath, testFileName);
		}

		if (options.testDirectory) {
			return join(options.testDirectory, testFileName);
		}

		if (this.defaultTestDirectory) {
			return join(this.defaultTestDirectory, testFileName);
		}

		return undefined;
	}

	private getFunctionKey(
		func: Pick<FunctionInfo, "filePath" | "name">,
	): string {
		return `${func.filePath.replace(/\\/g, "/")}::${func.name}`;
	}
}

// Helper function for generating test file names (shared with generate command)
function generateTestFileName(
	originalPath: string,
	functionName: string,
): string {
	const baseName = basename(originalPath, extname(originalPath));
	const dir = dirname(originalPath)
		.replace(/^\.\//, "")
		.replace(/[\\/]/g, "-");
	return `${dir ? `${dir}-` : ""}${baseName}-${functionName}.test.ts`;
}
