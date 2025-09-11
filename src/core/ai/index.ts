/**
 * AI Connector Module
 * Simple, extensible AI provider integration for test generation
 */

export * from './types';
export * from './ai-connector';
export * from './providers/ollama';
export * from './providers/mistral';
export * from './code-validator';

// Export factory function for creating AI connector
import { AIConnector } from './ai-connector';
import type { AIConnectorConfig } from './types';

export function createAIConnector(config: AIConnectorConfig): AIConnector {
    return new AIConnector(config);
}