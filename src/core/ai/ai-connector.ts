import {
	type ChatModel,
	igniteEngine,
	type LlmEngine,
	type LlmResponse,
	Message,
} from "multi-llm-ts";
import type { Result } from "../../types/misc";
import type { AIConnectorConfig } from "./types";

export class AIConnector {
	private readonly provider: LlmEngine;
	private readonly model: {
		modelName: string;
		chatModel?: ChatModel;
	};

	constructor(config: AIConnectorConfig) {
		this.provider = this.createProvider(config);
		this.model = {
			modelName: config.model,
		};
	}

	async generateTestsForFunction(
		systemPrompt: string,
		userPrompt: string,
	): Promise<Result<LlmResponse>> {
		if (!this.model.chatModel) {
			this.model.chatModel = this.provider.buildModel(this.model.modelName);
		}
		const messages = [
			new Message("system", systemPrompt),
			new Message("user", userPrompt),
		];

		return {
			ok: true,
			value: await this.provider.complete(this.model.chatModel, messages),
		};
	}

	private createProvider(config: AIConnectorConfig): LlmEngine {
		return igniteEngine(config.provider, config.engine);
	}
}
