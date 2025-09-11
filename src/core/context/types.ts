import type { FunctionInfo } from '../../types/discovery';
import type { Result } from '../../types/misc';

export interface FunctionContext {
    readonly function: FunctionInfo;
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
    buildFunctionContext(func: FunctionInfo): FunctionContext;
    buildSystemPrompt(functions: readonly FunctionInfo[]): Result<GeneratedPrompt>;
}

export interface IPromptGenerator {
    generateSystemPrompt(context: SystemPromptContext): Result<string>;
    generateUserPrompt(context: SystemPromptContext): Result<string>;
}