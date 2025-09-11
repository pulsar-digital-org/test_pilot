import type { IPromptGenerator, SystemPromptContext } from './types';
import type { Result } from '../../types/misc';

export class PromptGenerator implements IPromptGenerator {
    generateSystemPrompt(context: SystemPromptContext): Result<string> {
        try {
            const sections: string[] = [];

            // Header
            sections.push(this.generateHeader());

            // Functions context
            if (context.functions.length > 0) {
                sections.push(this.generateFunctionsContext(context));
            }

            // Generation guidelines
            sections.push(this.generateGuidelines());

            const systemPrompt = sections.join('\n\n');

            return { ok: true, value: systemPrompt };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }

    generateUserPrompt(context: SystemPromptContext): Result<string> {
        try {
            const prompts: string[] = [];

            prompts.push('Generate comprehensive unit tests for the following functions:');
            context.functions.forEach(func => {
                prompts.push(`- ${func.function.name}() from ${func.function.filePath}`);
            });

            prompts.push('\nEnsure the tests are:');
            prompts.push('1. Comprehensive and cover edge cases');
            prompts.push('2. Follow TypeScript/JavaScript testing best practices');
            prompts.push('3. Include proper setup and teardown');
            prompts.push('4. Have descriptive test names and assertions');
            prompts.push('5. Mock external dependencies appropriately');

            return { ok: true, value: prompts.join('\n') };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }

    private generateHeader(): string {
        return `# Test Generation System Prompt

You are an expert TypeScript/JavaScript developer specializing in unit test generation.
Your task is to generate high-quality, comprehensive tests based on the provided function analysis.`;
    }

    private generateFunctionsContext(context: SystemPromptContext): string {
        const lines = ['## Functions to Test'];

        context.functions.forEach((funcContext, index) => {
            const func = funcContext.function;
            lines.push(`\n### ${index + 1}. ${func.name}()`);
            lines.push(`**File**: ${func.filePath}`);
            
            // Parameters
            if (func.parameters.length > 0) {
                lines.push('\n**Parameters**:');
                func.parameters.forEach(param => {
                    const optionalText = param.optional ? ' (optional)' : '';
                    const defaultText = param.defaultValue ? ` = ${param.defaultValue}` : '';
                    lines.push(`- \`${param.name}\`: ${param.type || 'unknown'}${optionalText}${defaultText}`);
                });
            }

            // Return type
            if (func.returnType) {
                lines.push(`\n**Returns**: ${func.returnType}`);
            }

            // Async indicator
            if (func.isAsync) {
                lines.push('\n**Type**: Async function');
            }

            // JSDoc
            if (func.jsDoc) {
                lines.push('\n**Documentation**:');
                lines.push(func.jsDoc);
            }

            // Implementation
            lines.push('\n**Implementation**:');
            lines.push('```typescript');
            lines.push(func.implementation || 'No implementation available');
            lines.push('```');
        });

        return lines.join('\n');
    }

    private generateGuidelines(): string {
        return `## Test Generation Guidelines

1. **Test Structure**: Use standard Jest/Vitest syntax with describe() and test() blocks
2. **Coverage**: Generate tests for happy path, edge cases, and error conditions
3. **Mocking**: Mock external dependencies and API calls appropriately
4. **Assertions**: Use specific assertions that verify both behavior and output
5. **Setup/Teardown**: Include necessary setup and cleanup code
6. **Naming**: Use descriptive test names that explain what is being tested
7. **Organization**: Group related tests logically using describe blocks
8. **Data**: Use realistic test data that reflects actual usage patterns
9. **Async Testing**: Properly handle async functions with await/promises
10. **Types**: Maintain TypeScript type safety in tests

Generate clean, maintainable tests that thoroughly validate the function's behavior.`;
    }
}