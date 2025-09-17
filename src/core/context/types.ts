import type { EnhancedFunctionInfo, FunctionAnalysis } from "../analysis/types";
import type { FunctionInfo } from "../../types/discovery";
import type { Result } from "../../types/misc";
import type { ImportInfo } from "./import-resolver";

export interface FunctionContext {
	readonly function: FunctionInfo;
	readonly imports?: ImportInfo;
	readonly analysis?: FunctionAnalysis;
}

export interface SystemPromptContext {
	readonly functions: readonly FunctionContext[];
}

export interface GeneratedPrompt {
	readonly systemPrompt: string;
	readonly userPrompt: string;
	readonly context: SystemPromptContext;
	readonly metadata: PromptMetadata;
}

export interface PromptMetadata {
	readonly generatedAt: Date;
	readonly functionsCount: number;
}

export interface IContextBuilder {
	withFunctions(functions: readonly FunctionInfo[]): IContextBuilder;
	withAnalysis(functions: readonly EnhancedFunctionInfo[]): IContextBuilder;
	withDefaultTestDirectory(directory: string): IContextBuilder;
	buildFunctionContext(
		func: FunctionInfo,
		options?: BuildContextOptions,
	): FunctionContext;
	buildSystemPrompt(
		functions: readonly FunctionInfo[],
		options?: BuildContextOptions | string,
	): Result<GeneratedPrompt>;
	buildForFunction(
		func: FunctionInfo,
		options?: BuildContextOptions,
	): Result<GeneratedPrompt>;
}

export interface IPromptGenerator {
	generateSystemPrompt(context: SystemPromptContext): Result<string>;
	generateUserPrompt(context: SystemPromptContext): Result<string>;
}

export interface BuildContextOptions {
	readonly testFilePath?: string;
	readonly testDirectory?: string;
}
