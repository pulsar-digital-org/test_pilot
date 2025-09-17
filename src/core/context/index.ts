/**
 * Context Generation Module
 * Builds LLM system prompts from discovery and analysis results
 */

export * from "./context-builder";
export * from "./import-resolver";
export * from "./prompt-generator";
export * from "./types";

import type { EnhancedFunctionInfo } from "../analysis/types";
import type { FunctionInfo } from "../../types/discovery";
import type { ImportResolver } from "./import-resolver";
import { ContextBuilder } from "./context-builder";
import { PromptGenerator } from "./prompt-generator";

export interface ContextBuilderFactoryOptions {
	readonly functions?: readonly FunctionInfo[];
	readonly analysis?: readonly EnhancedFunctionInfo[];
	readonly defaultTestDirectory?: string;
	readonly importResolver?: ImportResolver;
}

export function createContextBuilder(
	options: ContextBuilderFactoryOptions = {},
): ContextBuilder {
	const promptGenerator = new PromptGenerator();
	const builder = new ContextBuilder(promptGenerator, {
		importResolver: options.importResolver,
	});

	if (options.functions?.length) {
		builder.withFunctions(options.functions);
	}

	if (options.analysis?.length) {
		builder.withAnalysis(options.analysis);
	}

	if (options.defaultTestDirectory) {
		builder.withDefaultTestDirectory(options.defaultTestDirectory);
	}

	return builder;
}
