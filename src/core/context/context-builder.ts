import type { 
    IContextBuilder, 
    FunctionContext, 
    SystemPromptContext,
    GeneratedPrompt,
    IPromptGenerator
} from './types';
import type { FunctionInfo } from '../../types/discovery';
import type { Result } from '../../types/misc';

export class ContextBuilder implements IContextBuilder {
    constructor(
        private readonly promptGenerator: IPromptGenerator
    ) {}

    buildFunctionContext(func: FunctionInfo): FunctionContext {
        return {
            function: func
        };
    }

    buildSystemPrompt(functions: readonly FunctionInfo[]): Result<GeneratedPrompt> {
        try {
            // Build function contexts directly
            const functionContexts = functions.map(func => this.buildFunctionContext(func));

            const systemPromptContext: SystemPromptContext = {
                functions: functionContexts
            };

            // Generate prompts
            const systemPromptResult = this.promptGenerator.generateSystemPrompt(systemPromptContext);
            const userPromptResult = this.promptGenerator.generateUserPrompt(systemPromptContext);
            
            if (!systemPromptResult.ok) {
                return { ok: false, error: systemPromptResult.error };
            }
            if (!userPromptResult.ok) {
                return { ok: false, error: userPromptResult.error };
            }

            const generatedPrompt: GeneratedPrompt = {
                systemPrompt: systemPromptResult.value,
                userPrompt: userPromptResult.value,
                context: systemPromptContext,
                metadata: {
                    generatedAt: new Date(),
                    functionsCount: functions.length
                }
            };

            return { ok: true, value: generatedPrompt };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }
}