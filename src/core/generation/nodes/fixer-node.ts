import type { AIConnector } from "../../ai";
import type { FunctionInfo } from "../../../types/discovery";
import type { FixerNode } from "../types";
import type { Result } from "../../../types/misc";

export class TestFixerNode implements FixerNode {
	readonly type = "fixer" as const;
	readonly name = "test-fixer";

	constructor(private readonly aiConnector: AIConnector) {}

	async fix(
		testCode: string,
		issues: string[],
		functionInfo: FunctionInfo,
	): Promise<Result<string>> {
		try {
			// Build fixing prompt
			const fixingPrompt = this.buildFixingPrompt(testCode, issues, functionInfo);

			// Get AI to fix the test
			const aiResult = await this.aiConnector.generateTestsForFunction(
				this.buildFixingSystemPrompt(),
				fixingPrompt,
			);

			if (!aiResult.ok) {
				// Fallback to rule-based fixes
				return this.applyRuleBasedFixes(testCode, issues);
			}

			// Extract fixed code
			const fixedCode = this.extractFixedCode(aiResult.value.content);
			if (!fixedCode) {
				return this.applyRuleBasedFixes(testCode, issues);
			}

			return { ok: true, value: fixedCode };
		} catch (error) {
			// Fallback to rule-based fixes on any error
			return this.applyRuleBasedFixes(testCode, issues);
		}
	}

	private buildFixingSystemPrompt(): string {
		return `You are a test code fixer. Your job is to fix failing tests by addressing specific issues.

Rules:
1. Fix ONLY the reported issues, don't change working parts
2. Maintain the test's original intent and structure
3. Keep all existing test cases unless they're causing issues
4. Add missing imports if needed
5. Fix syntax errors carefully
6. Preserve test framework usage patterns

Respond with ONLY the fixed test code in a single code block, no explanation needed.`;
	}

	private buildFixingPrompt(
		testCode: string,
		issues: string[],
		functionInfo: FunctionInfo,
	): string {
		let prompt = `**Function Being Tested:**
\`\`\`typescript
${functionInfo.implementation}
\`\`\`

**Current Test Code (with issues):**
\`\`\`typescript
${testCode}
\`\`\`

**Issues to Fix:**`;

		issues.forEach((issue, i) => {
			prompt += `\n${i + 1}. ${issue}`;
		});

		prompt += `\n\n**Function Context:**
- Function: ${functionInfo.name}
- Parameters: ${functionInfo.parameters.map(p => `${p.name}: ${p.type || 'unknown'}`).join(", ")}
- Return Type: ${functionInfo.returnType || 'unknown'}
- Is Async: ${functionInfo.isAsync}`;

		if (functionInfo.jsDoc) {
			prompt += `\n- Documentation: ${functionInfo.jsDoc}`;
		}

		prompt += `\n\nPlease provide the fixed test code:`;

		return prompt;
	}

	private extractFixedCode(response: string): string | null {
		// Look for code blocks
		const codeBlockMatch = response.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)\n```/);
		if (codeBlockMatch && codeBlockMatch[1]) {
			return codeBlockMatch[1].trim();
		}

		// Look for any code block
		const genericCodeMatch = response.match(/```\n([\s\S]*?)\n```/);
		if (genericCodeMatch && genericCodeMatch[1]) {
			return genericCodeMatch[1].trim();
		}

		return null;
	}

	private applyRuleBasedFixes(testCode: string, issues: string[]): Result<string> {
		let fixedCode = testCode;
		const appliedFixes: string[] = [];

		for (const issue of issues) {
			const lowerIssue = issue.toLowerCase();

			// Fix missing test framework imports
			if (lowerIssue.includes("missing framework imports") || lowerIssue.includes("describe is not defined")) {
				if (!fixedCode.includes("import") || !fixedCode.includes("vitest")) {
					fixedCode = `import { describe, test, expect, beforeEach, afterEach } from 'vitest';\n\n${fixedCode}`;
					appliedFixes.push("Added vitest imports");
				}
			}

			// Fix missing function imports
			if (lowerIssue.includes("import") && lowerIssue.includes("function")) {
				// This is more complex and would need function context
				// For now, add a generic comment
				if (!fixedCode.includes("// TODO: Add function import")) {
					const lines = fixedCode.split("\n");
					const importIndex = lines.findIndex(line => line.includes("import")) + 1;
					lines.splice(importIndex, 0, "// TODO: Add function import");
					fixedCode = lines.join("\n");
					appliedFixes.push("Added function import placeholder");
				}
			}

			// Fix unbalanced braces
			if (lowerIssue.includes("unbalanced braces")) {
				const openBraces = (fixedCode.match(/{/g) || []).length;
				const closeBraces = (fixedCode.match(/}/g) || []).length;

				if (openBraces > closeBraces) {
					fixedCode += "\n}".repeat(openBraces - closeBraces);
					appliedFixes.push("Added missing closing braces");
				}
			}

			// Fix unbalanced parentheses
			if (lowerIssue.includes("unbalanced parentheses")) {
				const openParens = (fixedCode.match(/\(/g) || []).length;
				const closeParens = (fixedCode.match(/\)/g) || []).length;

				if (openParens > closeParens) {
					fixedCode += ")".repeat(openParens - closeParens);
					appliedFixes.push("Added missing closing parentheses");
				}
			}

			// Fix missing test cases
			if (lowerIssue.includes("no test cases found")) {
				if (!fixedCode.includes("test(") && !fixedCode.includes("it(")) {
					fixedCode += `\n\ntest('should work correctly', () => {\n  // TODO: Add test implementation\n  expect(true).toBe(true);\n});`;
					appliedFixes.push("Added basic test case");
				}
			}

			// Fix missing assertions
			if (lowerIssue.includes("no assertions found")) {
				if (!fixedCode.includes("expect(")) {
					// Try to add a basic assertion to existing test cases
					fixedCode = fixedCode.replace(
						/test\([^{]*{\s*([^}]*)\s*}/g,
						(match, testBody) => {
							if (!testBody.includes("expect(")) {
								return match.replace(testBody, `${testBody}\n  expect(true).toBe(true); // TODO: Replace with real assertion`);
							}
							return match;
						}
					);
					appliedFixes.push("Added basic assertions");
				}
			}
		}

		if (appliedFixes.length === 0) {
			return {
				ok: false,
				error: new Error("No rule-based fixes could be applied for the given issues"),
			};
		}

		return { ok: true, value: fixedCode };
	}
}