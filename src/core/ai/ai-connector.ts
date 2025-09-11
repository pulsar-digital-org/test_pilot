import type { IAIConnector, AIProvider, AIMessage, AIResponse, AIConnectorConfig } from './types';
import type { Result } from '../../types/misc';
import { OllamaProvider } from './providers/ollama';
import { MistralProvider } from './providers/mistral';

export class AIConnector implements IAIConnector {
    private readonly provider: AIProvider;

    constructor(config: AIConnectorConfig) {
        this.provider = this.createProvider(config);
    }

    async generateTestsForFunction(systemPrompt: string, userPrompt: string): Promise<Result<AIResponse>> {
        const messages: AIMessage[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];

        return await this.provider.generateResponse(messages);
    }

    private createProvider(config: AIConnectorConfig): AIProvider {
        switch (config.provider) {
            case 'ollama':
                return new OllamaProvider({
                    model: config.model,
                    baseUrl: config.baseUrl
                });
            
            case 'mistral':
                if (!config.apiKey) {
                    throw new Error('API key is required for Mistral provider');
                }
                return new MistralProvider({
                    model: config.model,
                    apiKey: config.apiKey,
                    baseUrl: config.baseUrl
                });
            
            case 'anthropic':
                // TODO: Implement when needed
                throw new Error('Anthropic provider not yet implemented');
            
            case 'openai':
                // TODO: Implement when needed
                throw new Error('OpenAI provider not yet implemented');
            
            default:
                throw new Error(`Unsupported AI provider: ${config.provider}`);
        }
    }
}