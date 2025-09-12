/**
 * Context Generation Module
 * Builds LLM system prompts from analyzed functions
 */

export * from "./context-builder";
export * from "./import-resolver";
export * from "./prompt-generator";
export * from "./types";

// Export main factory function for creating context builder
import { ContextBuilder } from "./context-builder";
import { PromptGenerator } from "./prompt-generator";

export function createContextBuilder(): ContextBuilder {
	const promptGenerator = new PromptGenerator();
	return new ContextBuilder(promptGenerator);
}

