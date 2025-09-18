/**
 * Creates an adjustable configuration that can be saved or loaded on command.
 *
 */

import fs from "node:fs";
import { DEFAULT_AI_CONNECTOR_OPTIONS } from "@core/ai/config";
import { DEFAULT_DISCOVERY_OPTIONS } from "@core/discovery";
import type { ConfigOptions, ConfigRootOptions } from "./types/core";

export class Config {
	private config: ConfigOptions;

	constructor(configInit: ConfigRootOptions) {
		this.config = {
			config: configInit,
		};
	}

	withAi(): this {
		this.config.ai = DEFAULT_AI_CONNECTOR_OPTIONS;

		return this;
	}

	withDiscovery(): this {
		this.config.discovery = DEFAULT_DISCOVERY_OPTIONS;

		return this;
	}

	async load() {
		if (!fs.existsSync(this.config.config.configDir)) {
			return { ok: false, error: new Error("Config folder not found") };
		}

		// Valid path
		// TODO: parse the config file

		return { ok: true };
	}

	public get() {
		return this.config;
	}
}
