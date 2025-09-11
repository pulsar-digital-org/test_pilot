import type { Result } from '../../types/misc';

export interface AIMessage {
    readonly role: 'system' | 'user' | 'assistant';
    readonly content: string;
}

export interface AIResponse {
    readonly content: string;
    readonly model: string;
    readonly usage?: {
        readonly promptTokens: number;
        readonly completionTokens: number;
        readonly totalTokens: number;
    };
}

export interface AIProvider {
    readonly name: string;
    generateResponse(messages: readonly AIMessage[]): Promise<Result<AIResponse>>;
}

export interface AIConnectorConfig {
    readonly provider: 'ollama' | 'anthropic' | 'openai' | 'mistral';
    readonly model: string;
    readonly baseUrl: string | undefined;
    readonly apiKey?: string;
}

export interface IAIConnector {
    generateTestsForFunction(systemPrompt: string, userPrompt: string): Promise<Result<AIResponse>>;
}