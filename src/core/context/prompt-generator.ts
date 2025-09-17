import type { Result } from "../../types/misc";
import type {
	FunctionContext,
	IPromptGenerator,
	SystemPromptContext,
} from "./types";

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
Your task is to generate high-quality, comprehensive tests using the provided discovery and analysis context.
Use the given call graph, usage data, and implementation details exactly as supplied—do not invent imports or behaviours that are not explicitly documented.`;
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

			// Class context (if this is a class method)
			if ((func as any).classContext) {
				const classInfo = (func as any).classContext;
				lines.push("\n**Class Context**:");
				lines.push("```typescript");
				
				// Class declaration with JSDoc if available
				if (classInfo.jsDoc) {
					lines.push(classInfo.jsDoc);
				}
				lines.push(`class ${classInfo.name} {`);
				
				// Properties
				if (classInfo.properties.length > 0) {
					classInfo.properties.forEach(prop => {
						const modifiers = [];
						if (prop.isPrivate) modifiers.push("private");
						if (prop.isStatic) modifiers.push("static");
						if (prop.isReadonly) modifiers.push("readonly");
						
						const modifierStr = modifiers.length > 0 ? modifiers.join(" ") + " " : "";
						const typeStr = prop.type ? `: ${prop.type}` : "";
						lines.push(`  ${modifierStr}${prop.name}${typeStr};`);
					});
					
					if (classInfo.methods.length > 0) {
						lines.push(""); // Empty line between properties and methods
					}
				}
				
				// Method signatures
				classInfo.methods.forEach(method => {
					const modifiers = [];
					if (method.isPrivate) modifiers.push("private");
					if (method.isStatic) modifiers.push("static");
					if (method.isAsync) modifiers.push("async");
					
					const modifierStr = modifiers.length > 0 ? modifiers.join(" ") + " " : "";
					const params = method.parameters.map(p => {
						const optional = p.optional ? "?" : "";
						const type = p.type ? `: ${p.type}` : "";
						const defaultVal = p.defaultValue ? ` = ${p.defaultValue}` : "";
						return `${p.name}${optional}${type}${defaultVal}`;
					}).join(", ");
					const returnType = method.returnType ? `: ${method.returnType}` : "";
					
					lines.push(`  ${modifierStr}${method.name}(${params})${returnType};`);
				});
				
				lines.push("}");
				lines.push("```");

				this.appendClassMethodGuidance(lines, funcContext);
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

			this.appendAnalysisSections(lines, funcContext);
		});

		return lines.join("\n");
	}

	private appendAnalysisSections(
		lines: string[],
		funcContext: FunctionContext,
	): void {
		const analysis = funcContext.analysis;
		if (!analysis) {
			return;
		}

		lines.push("\n**Direct Internal Calls**:");
		if (analysis.children.length > 0) {
			analysis.children.forEach((child) => {
				lines.push(
					`- ${this.describeFunctionReference(child.name, child.filePath)}`,
				);
			});
		} else {
			lines.push("- None detected");
		}

		lines.push("\n**External or Undiscovered Helpers**:");
		if (analysis.functions.length > 0) {
			analysis.functions.forEach((helper) => {
				const detailParts: string[] = [];

				if (helper.lspDocumentation?.signature) {
					detailParts.push(`signature: ${helper.lspDocumentation.signature}`);
				}

				const documentation =
					helper.lspDocumentation?.documentation ?? helper.jsDoc;
				if (documentation) {
					detailParts.push(
						`doc: ${this.collapseWhitespace(documentation)}`,
					);
				}

				if (helper.parents.length > 0) {
					const parentList = helper.parents
						.map((parent) =>
							this.describeFunctionReference(parent.name, parent.filePath),
						)
						.join(", ");
					detailParts.push(`referenced by: ${parentList}`);
				}

				const detailSuffix = detailParts.length
					? ` — ${detailParts.join("; ")}`
					: "";

				lines.push(
					`- ${helper.name} (line ${helper.line})${detailSuffix}`,
				);
			});
		} else {
			lines.push("- None detected");
		}

		lines.push("\n**Usage Across Codebase**:");
		if (analysis.parents.length > 0) {
			analysis.parents.forEach((parent) => {
				lines.push(
					`- ${this.describeFunctionReference(parent.name, parent.filePath)}`,
				);
			});
		} else {
			lines.push("- Not referenced by other discovered functions");
		}
	}

	private describeFunctionReference(name: string, filePath: string): string {
		return `\`${name}()\` (${filePath})`;
	}

	private collapseWhitespace(value: string): string {
		return value.replace(/\s+/g, " ").trim();
	}

	private appendClassMethodGuidance(
		lines: string[],
		funcContext: FunctionContext,
	): void {
		const classMethod = this.extractClassMethodDetails(funcContext);
		if (!classMethod) {
			return;
		}

		lines.push("\n**Class Method Test Guidance**:");
		if (classMethod.isStatic) {
			lines.push(
				`- Call \`${classMethod.className}.${classMethod.methodName}()\` directly without instantiating the class`,
			);
		} else {
			const instanceVar = this.toInstanceVariable(classMethod.className);
			lines.push(
				`- Instantiate \`${classMethod.className}\` in a \`beforeEach\` hook and invoke \`${instanceVar}.${classMethod.methodName}()\` in each test`,
			);
			lines.push(
				`- Reuse the same instance variable (\`${instanceVar}\`) across tests to keep setup consistent`,
			);
		}

		lines.push("```typescript");
		if (classMethod.isStatic) {
			lines.push(`describe('${classMethod.className}.${classMethod.methodName}', () => {`);
			lines.push("  test('should ...', () => {");
			lines.push(
				`    const result = ${classMethod.className}.${classMethod.methodName}(/* arrange inputs */);`,
			);
			lines.push("    expect(result).toBeDefined();");
			lines.push("  });");
			lines.push("});");
		} else {
			const instanceVar = this.toInstanceVariable(classMethod.className);
			lines.push(`describe('${classMethod.className}.${classMethod.methodName}', () => {`);
			lines.push(`  let ${instanceVar}: ${classMethod.className};`);
			lines.push("");
			lines.push("  beforeEach(() => {");
			lines.push(`    ${instanceVar} = new ${classMethod.className}();`);
			lines.push("  });");
			lines.push("");
			lines.push("  test('should ...', () => {");
			lines.push(
				`    const result = ${instanceVar}.${classMethod.methodName}(/* arrange inputs */);`,
			);
			lines.push("    expect(result).toBeDefined();");
			lines.push("  });");
			lines.push("});");
		}
		lines.push("```");
	}

	private extractClassMethodDetails(
		funcContext: FunctionContext,
	): { className: string; methodName: string; isStatic: boolean } | null {
		const func = funcContext.function;
		if (!func.classContext) {
			return null;
		}

		const rawName = funcContext.function.name;
		const methodName = this.extractMethodName(rawName);
		const methodInfo = func.classContext.methods.find(
			(method) => method.name === methodName,
		);

		return {
			className: func.classContext.name,
			methodName,
			isStatic: methodInfo?.isStatic ?? false,
		};
	}

	private extractMethodName(functionName: string): string {
		const dotIndex = functionName.indexOf(".");
		if (dotIndex === -1) {
			return functionName;
		}
		return functionName.slice(dotIndex + 1);
	}

	private toInstanceVariable(className: string): string {
		if (!className) {
			return "instance";
		}
		if (className.length === 1) {
			return className.toLowerCase();
		}
		return className.charAt(0).toLowerCase() + className.slice(1);
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
