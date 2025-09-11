import type { AIProvider, AIMessage, AIResponse } from '../types';
import type { Result } from '../../../types/misc';

export interface MistralConfig {
    readonly model: string;
    readonly apiKey: string;
    readonly baseUrl?: string;
}

export class MistralProvider implements AIProvider {
    readonly name = 'mistral';
    private readonly baseUrl: string;
    private readonly model: string;
    private readonly apiKey: string;

    constructor(config: MistralConfig) {
        this.baseUrl = config.baseUrl || 'https://api.mistral.ai';
        this.model = config.model;
        this.apiKey = config.apiKey;
    }

    async generateResponse(messages: readonly AIMessage[]): Promise<Result<AIResponse>> {
        try {
            const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: messages.map(msg => ({
                        role: msg.role,
                        content: msg.content
                    })),
                    temperature: 0.1, // Lower temperature for more consistent code generation
                    max_tokens: 4000
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Mistral API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const data = await response.json();

            if (!data.choices?.[0]?.message?.content) {
                throw new Error('Invalid response from Mistral API');
            }

            return {
                ok: true,
                value: {
                    content: data.choices[0].message.content,
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