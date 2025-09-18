import type { AIConnectorOptions } from "@core/ai/types/core";
import type { DiscoveryOptions } from "@core/discovery";

export interface ConfigRootOptions {
	projectDir: string;
	configDir: string;
	workingDir: string;
}

export interface ConfigOptions {
	ai?: AIConnectorOptions;
	analysis?: string;
	context?: string;
	discovery?: DiscoveryOptions;
	execution?: string;
	generation?: string;

	config: ConfigRootOptions;
}
