import { TypeScriptParser } from "../discovery/typescript/parser";
import type { Result } from "../../types/misc";

export interface CodeValidationResult {
	readonly isValid: boolean;
	readonly code: string;
	readonly errors: readonly string[];
}

export class CodeValidator {
	private readonly parser: TypeScriptParser;

	constructor() {
		this.parser = new TypeScriptParser();
	}

	/**
	 * Extract TypeScript/JavaScript code from LLM response
	 */
	extractCode(llmResponse: string): string {
		// Look for code blocks first
		const codeBlockRegex =
			/```(?:typescript|ts|javascript|js)?\n?([\s\S]*?)\n?```/gi;
		const matches = Array.from(llmResponse.matchAll(codeBlockRegex));

		if (matches.length > 0) {
			// Return the largest code block (most likely the main content)
			const codeBlocks = matches.map((match) => match[1].trim());
			return codeBlocks.reduce((longest, current) =>
				current.length > longest.length ? current : longest,
			);
		}

		// If no code blocks, try to extract everything that looks like code
		// This is a fallback for when LLM doesn't use proper markdown
		const lines = llmResponse.split("\n");
		const codeLines: string[] = [];
		let inCodeSection = false;

		for (const line of lines) {
			// Detect start of code section
			if (
				line.includes("import") ||
				line.includes("describe") ||
				line.includes("test") ||
				line.includes("expect")
			) {
				inCodeSection = true;
			}

			// Stop at explanatory text after code
			if (
				inCodeSection &&
				(line.includes("This test") ||
					line.includes("The test") ||
					line.includes("These tests"))
			) {
				break;
			}

			if (inCodeSection) {
				codeLines.push(line);
			}
		}

		return codeLines.length > 0 ? codeLines.join("\n").trim() : "";
	}

	/**
	 * Validate TypeScript code using our parser
	 */
	validateTypeScript(code: string): Result<CodeValidationResult> {
		try {
			// Try to parse the code content directly
			const parseResult = this.parser.parseContent(code, "validation.test.ts");

			if (!parseResult.ok) {
				return {
					ok: true,
					value: {
						isValid: false,
						code,
						errors: [parseResult.error.message],
					},
				};
			}

			// If parsing succeeded, the code is syntactically valid
			return {
				ok: true,
				value: {
					isValid: true,
					code,
					errors: [],
				},
			};
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	/**
	 * Extract and validate code in one step
	 */
	extractAndValidate(llmResponse: string): Result<CodeValidationResult> {
		try {
			const extractedCode = this.extractCode(llmResponse);

			if (!extractedCode) {
				return {
					ok: true,
					value: {
						isValid: false,
						code: "",
						errors: ["No code found in LLM response"],
					},
				};
			}

			return this.validateTypeScript(extractedCode);
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	/**
	 * Generate retry prompt when validation fails
	 */
	generateRetryPrompt(
		originalPrompt: string,
		errors: readonly string[],
	): string {
		const errorsList = errors.map((error) => `- ${error}`).join("\n");

		return `${originalPrompt}

IMPORTANT: The previous response had the following issues:
${errorsList}

Please fix these issues and return ONLY valid TypeScript code in a code block. Make sure:
1. All imports are correct
2. All syntax is valid TypeScript
3. All variables and functions are properly defined
4. The code follows TypeScript best practices

Return only the corrected test code in a \`\`\`typescript code block.`;
	}
}

