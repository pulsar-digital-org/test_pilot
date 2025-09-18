import type { AIConnectorOptions } from "./types/core";

export const DEFAULT_AI_CONNECTOR_OPTIONS: Required<AIConnectorOptions> = {
	provider: "ollama",
	model: "devstral",
	engine: {},
} as const;
