import type { AIConnector } from "../../ai";
import type {
	GeneratorNode,
	GenerationState,
	GeneratedTestResult,
} from "../types";
import type { Result } from "../../../types/misc";

export class TestGeneratorNode implements GeneratorNode {
	readonly type = "generator" as const;
	readonly name = "test-generator";

	constructor(private readonly aiConnector: AIConnector) {}

	async generate(state: GenerationState): Promise<Result<GeneratedTestResult>> {
		try {
			// Build prompt with context from previous attempts
			const enhancedPrompt = this.buildEnhancedPrompt(state);

			// Generate test using AI
			const aiResult = await this.aiConnector.generateTestsForFunction(
				state.systemPrompt,
				enhancedPrompt,
			);

			if (!aiResult.ok) {
				return { ok: false, error: aiResult.error };
			}

			// Extract code from AI response
			const extractedCode = this.extractCodeFromResponse(aiResult.value.content);
			if (!extractedCode) {
				return {
					ok: false,
					error: new Error("Could not extract valid code from AI response"),
				};
			}

			// Calculate confidence based on attempt number and previous issues
			const confidence = this.calculateConfidence(state);

			const result: GeneratedTestResult = {
				code: extractedCode,
				confidence,
				metadata: {
					attempt: state.attempts,
					tokensUsed: aiResult.value.usage,
					previousIssues: state.issues?.length || 0,
				},
			};

			return { ok: true, value: result };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private buildEnhancedPrompt(state: GenerationState): string {
		let prompt = state.userPrompt;

		if (state.objective) {
			prompt += `\n\n**Current Focus:** ${state.objective}`;
		}

		// Add context from previous attempts
		if (state.attempts > 1 && state.issues?.length) {
			prompt += `\n\n**Previous attempt had these issues:**\n`;
			state.issues.forEach((issue, i) => {
				prompt += `${i + 1}. ${issue}\n`;
			});
			prompt += `\n**Please address these issues in your new test generation.**`;
		}

		// Include validation feedback if previous attempt failed validation
		if (state.validationResult && !state.validationResult.isValid) {
			prompt += `\n\n**Validation issues to fix:**\n`;
			state.validationResult.issues.forEach((issue, index) => {
				prompt += `${index + 1}. ${issue}\n`;
			});
			if (state.validationResult.syntaxErrors?.length) {
				prompt += `- Syntax errors: ${state.validationResult.syntaxErrors.join(", ")}\n`;
			}
			if (state.validationResult.importErrors?.length) {
				prompt += `- Import issues: ${state.validationResult.importErrors.join(", ")}\n`;
			}
			prompt += `\n**Ensure the regenerated test compiles without these problems.**`;
		}

		// Add execution context if available
		if (state.executionResult && !state.executionResult.success) {
			prompt += `\n\n**Previous test execution failed with:**\n`;
			if (state.executionResult.errors?.length) {
				state.executionResult.errors.forEach((error, i) => {
					const location =
						error.line !== undefined
							? ` (line ${error.line}${error.column ? `, col ${error.column}` : ""})`
							: "";
					prompt += `${i + 1}. ${error.type}${location}: ${error.message}\n`;
				});
			}
			prompt += `\n**Generate a test that addresses these runtime failures.**`;
		}

		// Add quality improvement hints
		if (state.qualityScore && state.qualityScore.overall < 70) {
			prompt += `\n\n**Quality Improvement Needed:**\n`;
			prompt += this.buildQualityRecommendations(state);
		}

		return prompt;
	}

	private buildQualityRecommendations(state: GenerationState): string {
		const recommendations: string[] = [];
		if (!state.qualityScore) {
			return "";
		}
		if (state.qualityScore.coverage < 70) {
			recommendations.push("Add more edge cases and boundary conditions");
		}
		if (state.qualityScore.correctness < 70) {
			recommendations.push("Correct any syntax mistakes and ensure assertions reflect the implementation accurately");
		}
		if (state.qualityScore.completeness < 70) {
			recommendations.push("Cover the remaining branches and error scenarios in the implementation");
		}
		if (state.qualityScore.maintainability < 70) {
			recommendations.push("Improve structure, naming, and remove redundant setup in the tests");
		}
		if (!recommendations.length) {
			return "";
		}
		return `- ${recommendations.join("\n- ")}\n`;
	}

	private extractCodeFromResponse(response: string): string | null {
		// Look for TypeScript/JavaScript code blocks
		const codeBlockMatch = response.match(/```(?:typescript|javascript|ts|js)?\n([\s\S]*?)\n```/);
		if (codeBlockMatch && codeBlockMatch[1]) {
			return codeBlockMatch[1].trim();
		}

		// Look for any code block
		const genericCodeMatch = response.match(/```\n([\s\S]*?)\n```/);
		if (genericCodeMatch && genericCodeMatch[1]) {
			return genericCodeMatch[1].trim();
		}

		// If no code blocks, look for import statements as start of code
		const importMatch = response.match(/import[\s\S]*?(?=\n\n|\n$|$)/);
		if (importMatch) {
			const startIndex = response.indexOf(importMatch[0]);
			return response.slice(startIndex).trim();
		}

		return null;
	}

	private calculateConfidence(state: GenerationState): number {
		let confidence = 0.8; // Base confidence

		// Reduce confidence for each attempt
		confidence -= (state.attempts - 1) * 0.1;

		// Reduce confidence based on previous issues
		if (state.issues?.length) {
			confidence -= state.issues.length * 0.05;
		}

		// Reduce confidence if previous execution failed
		if (state.executionResult && !state.executionResult.success) {
			confidence -= 0.2;
		}

		// Boost confidence if previous quality score was decent
		if (state.qualityScore && state.qualityScore.overall > 60) {
			confidence += 0.1;
		}

		// Clamp between 0 and 1
		return Math.max(0.1, Math.min(1.0, confidence));
	}
}
