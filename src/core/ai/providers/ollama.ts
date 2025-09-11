import type { AIProvider, AIMessage, AIResponse } from '../types';
import type { Result } from '../../../types/misc';

export interface OllamaConfig {
    readonly model: string;
    readonly baseUrl: string | undefined;
}

export class OllamaProvider implements AIProvider {
    readonly name = 'ollama';
    private readonly baseUrl: string;
    private readonly model: string;

    constructor(config: OllamaConfig) {
        this.baseUrl = config.baseUrl || 'http://localhost:11434';
        this.model = config.model;
    }

    async generateResponse(messages: readonly AIMessage[]): Promise<Result<AIResponse>> {
        try {
            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })),
                    stream: false
                })
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.message?.content) {
                throw new Error('Invalid response from Ollama API');
            }

            return {
                ok: true,
                value: {
                    content: data.message.content,
                    model: this.model,
                    usage: data.usage ? {
                        promptTokens: data.usage.prompt_tokens || 0,
                        completionTokens: data.usage.completion_tokens || 0,
                        totalTokens: data.usage.total_tokens || 0
                    } : undefined
                }
            };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }
}