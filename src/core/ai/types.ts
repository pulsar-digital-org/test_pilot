import type { EngineCreateOpts } from "multi-llm-ts";

export type AIProviders = "ollama" | "anthropic" | "openai" | "mistral";

export interface AIConnectorConfig {
	readonly provider: AIProviders;
	readonly model: string;
	readonly engine: EngineCreateOpts;
}
