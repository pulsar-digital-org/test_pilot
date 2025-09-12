import type { Result } from "../../types/misc";
import type { IPromptGenerator, SystemPromptContext } from "./types";

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

			const systemPrompt = sections.join("\n\n");

			return { ok: true, value: systemPrompt };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	generateUserPrompt(context: SystemPromptContext): Result<string> {
		try {
			const prompts: string[] = [];

			prompts.push(
				"Generate comprehensive unit tests for the following functions:",
			);
			context.functions.forEach((func) => {
				prompts.push(
					`- ${func.function.name}() from ${func.function.filePath}`,
				);
			});

			prompts.push("\nEnsure the tests are:");
			prompts.push("1. Comprehensive and cover edge cases");
			prompts.push("2. Follow TypeScript/JavaScript testing best practices");
			prompts.push("3. Include proper setup and teardown");
			prompts.push("4. Have descriptive test names and assertions");
			prompts.push("5. Mock external dependencies appropriately");

			return { ok: true, value: prompts.join("\n") };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private generateHeader(): string {
		return `# Test Generation System Prompt

You are an expert TypeScript/JavaScript developer specializing in unit test generation.
Your task is to generate high-quality, comprehensive tests based on the provided function analysis.`;
	}

	private generateFunctionsContext(context: SystemPromptContext): string {
		const lines = ["## Functions to Test"];

		context.functions.forEach((funcContext, index) => {
			const func = funcContext.function;
			lines.push(`\n### ${index + 1}. ${func.name}()`);
			lines.push(`**File**: ${func.filePath}`);

			// Import information
			if (funcContext.imports) {
				lines.push("\n**Import Instructions**:");
				lines.push("```typescript");
				lines.push("// Testing framework imports:");
				lines.push(funcContext.imports.testingFramework.imports.describe);
				lines.push("");
				lines.push("// Function import:");
				lines.push(funcContext.imports.functionImport);
				lines.push("```");

				lines.push(
					`\n**Testing Framework**: ${funcContext.imports.testingFramework.name}`,
				);
				if (funcContext.imports.testingFramework.name !== "unknown") {
					lines.push(
						`- Use \`${funcContext.imports.testingFramework.imports.test}\` for test cases`,
					);
					lines.push(
						`- Use \`${funcContext.imports.testingFramework.imports.expect}\` for assertions`,
					);
					if (funcContext.imports.testingFramework.imports.mock) {
						lines.push(
							`- Use \`${funcContext.imports.testingFramework.imports.mock}\` for mocking`,
						);
					}
				}
			}

			// Parameters
			if (func.parameters.length > 0) {
				lines.push("\n**Parameters**:");
				func.parameters.forEach((param) => {
					const optionalText = param.optional ? " (optional)" : "";
					const defaultText = param.defaultValue
						? ` = ${param.defaultValue}`
						: "";
					lines.push(
						`- \`${param.name}\`: ${param.type || "unknown"}${optionalText}${defaultText}`,
					);
				});
			}

			// Return type
			if (func.returnType) {
				lines.push(`\n**Returns**: ${func.returnType}`);
			}

			// Async indicator
			if (func.isAsync) {
				lines.push("\n**Type**: Async function");
			}

			// JSDoc
			if (func.jsDoc) {
				lines.push("\n**Documentation**:");
				lines.push(func.jsDoc);
			}

			// Implementation
			lines.push("\n**Implementation**:");
			lines.push("```typescript");
			lines.push(func.implementation || "No implementation available");
			lines.push("```");
		});

		return lines.join("\n");
	}

	private generateGuidelines(): string {
		return `## Test Generation Guidelines

1. **CRITICAL - Use Provided Imports**: ALWAYS use the exact import statements provided in the "Import Instructions" section above. Do not modify or assume different import paths.

2. **Test Structure**: Use the specified testing framework syntax (describe/test blocks as shown in imports)

3. **Import Requirements**: 
   - Use the exact testing framework imports provided
   - Use the exact function import path provided
   - Do not add extra imports unless absolutely necessary

4. **Coverage**: Generate tests for happy path, edge cases, and error conditions

5. **Assertions**: Use the specified assertion methods (expect) from the testing framework

6. **Mocking**: Use the specified mocking utilities if provided by the framework

7. **Setup/Teardown**: Include necessary setup and cleanup code using framework-specific methods

8. **Naming**: Use descriptive test names that explain what is being tested

9. **Organization**: Group related tests logically using describe blocks

10. **Async Testing**: Properly handle async functions with await/promises

11. **Types**: Maintain TypeScript type safety in tests

IMPORTANT: Return ONLY the test code with the correct imports - no explanations or additional text.`;
	}
}

