import type { AIConnector } from "../../ai";
import type { FunctionInfo } from "../../../types/discovery";
import type { ExecutionResult } from "../../execution/types";
import type { ScorerNode, QualityScore } from "../types";
import type { Result } from "../../../types/misc";

export class TestScorerNode implements ScorerNode {
	readonly type = "scorer" as const;
	readonly name = "test-scorer";

	constructor(private readonly aiConnector: AIConnector) {}

	async score(
		testCode: string,
		executionResult: ExecutionResult,
		functionInfo: FunctionInfo,
	): Promise<Result<QualityScore>> {
		try {
			// Create scoring prompt
			const scoringPrompt = this.buildScoringPrompt(testCode, executionResult, functionInfo);

			// Get LLM evaluation
			const aiResult = await this.aiConnector.generateTestsForFunction(
				this.buildScoringSystemPrompt(),
				scoringPrompt,
			);

			if (!aiResult.ok) {
				// Fallback to basic scoring if LLM fails
				return this.fallbackScoring(testCode, executionResult);
			}

			// Parse LLM response
			const parsedScore = this.parseLLMScore(aiResult.value.content);
			if (parsedScore) {
				return { ok: true, value: parsedScore };
			}

			// Fallback if parsing fails
			return this.fallbackScoring(testCode, executionResult);
		} catch (error) {
			// Fallback scoring on any error
			return this.fallbackScoring(testCode, executionResult);
		}
	}

	private buildScoringSystemPrompt(): string {
		return `You are a test quality evaluator. Your job is to score test code quality on multiple dimensions.

Evaluate the test code and provide scores (0-100) for:
1. **Coverage** - How well does it test edge cases and boundary conditions?
2. **Correctness** - Is the syntax correct and logic sound?
3. **Completeness** - Does it test the full functionality thoroughly?
4. **Maintainability** - Is the code clean, readable, and well-structured?

Respond ONLY with a JSON object in this exact format:
{
  "coverage": 85,
  "correctness": 92,
  "completeness": 78,
  "maintainability": 88,
  "feedback": "Detailed feedback about strengths and areas for improvement"
}`;
	}

	private buildScoringPrompt(
		testCode: string,
		executionResult: ExecutionResult,
		functionInfo: FunctionInfo,
	): string {
		let prompt = `**Function Being Tested:**
\`\`\`typescript
${functionInfo.implementation}
\`\`\`

**Generated Test Code:**
\`\`\`typescript
${testCode}
\`\`\`

**Execution Result:**
- Success: ${executionResult.success}
- Execution Time: ${executionResult.executionTime}ms`;

		if (executionResult.stdout) {
			prompt += `\n- Output: ${executionResult.stdout}`;
		}

		if (executionResult.errors?.length) {
			prompt += `\n- Errors: ${executionResult.errors.map(e => `${e.type}: ${e.message}`).join(", ")}`;
		}

		prompt += `\n\n**Function Context:**
- Function: ${functionInfo.name}
- Parameters: ${functionInfo.parameters.map(p => `${p.name}: ${p.type || 'unknown'}`).join(", ")}
- Return Type: ${functionInfo.returnType || 'unknown'}
- Is Async: ${functionInfo.isAsync}`;

		if (functionInfo.jsDoc) {
			prompt += `\n- Documentation: ${functionInfo.jsDoc}`;
		}

		prompt += `\n\nEvaluate this test's quality and provide scores.`;

		return prompt;
	}

	private parseLLMScore(response: string): QualityScore | null {
		try {
			// Try to extract JSON from response
			const jsonMatch = response.match(/\{[\s\S]*\}/);
			if (!jsonMatch) return null;

			const parsed = JSON.parse(jsonMatch[0]);

			// Validate required fields
			if (
				typeof parsed.coverage !== "number" ||
				typeof parsed.correctness !== "number" ||
				typeof parsed.completeness !== "number" ||
				typeof parsed.maintainability !== "number"
			) {
				return null;
			}

			// Calculate overall score
			const overall = Math.round(
				(parsed.coverage + parsed.correctness + parsed.completeness + parsed.maintainability) / 4
			);

			return {
				overall,
				coverage: Math.max(0, Math.min(100, parsed.coverage)),
				correctness: Math.max(0, Math.min(100, parsed.correctness)),
				completeness: Math.max(0, Math.min(100, parsed.completeness)),
				maintainability: Math.max(0, Math.min(100, parsed.maintainability)),
				feedback: parsed.feedback || "No feedback provided",
			};
		} catch {
			return null;
		}
	}

	private fallbackScoring(testCode: string, executionResult: ExecutionResult): Result<QualityScore> {
		// Basic rule-based scoring when LLM is unavailable
		let coverage = 60; // Base score
		let correctness = executionResult.success ? 85 : 30;
		let completeness = 60;
		let maintainability = 70;

		// Coverage analysis
		const testCases = (testCode.match(/(?:test|it)\s*\(/g) || []).length;
		coverage += Math.min(30, testCases * 10); // Bonus for multiple test cases

		if (testCode.includes("edge") || testCode.includes("boundary")) {
			coverage += 10;
		}

		// Completeness analysis
		const assertions = (testCode.match(/expect\s*\(/g) || []).length;
		completeness += Math.min(25, assertions * 5); // Bonus for assertions

		// Maintainability analysis
		if (testCode.includes("describe(")) maintainability += 10;
		if (testCode.includes("beforeEach") || testCode.includes("afterEach")) maintainability += 10;
		if (testCode.split("\n").length > 50) maintainability -= 10; // Penalty for very long tests

		// Correctness penalties
		if (executionResult.errors?.length) {
			correctness = Math.max(20, correctness - (executionResult.errors.length * 15));
		}

		// Clamp all scores
		coverage = Math.max(0, Math.min(100, coverage));
		correctness = Math.max(0, Math.min(100, correctness));
		completeness = Math.max(0, Math.min(100, completeness));
		maintainability = Math.max(0, Math.min(100, maintainability));

		const overall = Math.round((coverage + correctness + completeness + maintainability) / 4);

		const score: QualityScore = {
			overall,
			coverage,
			correctness,
			completeness,
			maintainability,
			feedback: this.generateFallbackFeedback(testCode, executionResult, {
				coverage,
				correctness,
				completeness,
				maintainability,
			}),
		};

		return { ok: true, value: score };
	}

	private generateFallbackFeedback(
		testCode: string,
		executionResult: ExecutionResult,
		scores: { coverage: number; correctness: number; completeness: number; maintainability: number },
	): string {
		const feedback: string[] = [];

		if (!executionResult.success) {
			feedback.push("❌ Test execution failed - fix runtime errors first");
		}

		if (scores.coverage < 70) {
			feedback.push("⚠️ Consider adding more edge cases and boundary conditions");
		}

		if (scores.completeness < 70) {
			const testCases = (testCode.match(/(?:test|it)\s*\(/g) || []).length;
			if (testCases < 3) {
				feedback.push("📝 Add more comprehensive test scenarios");
			}
		}

		if (scores.maintainability < 70) {
			if (!testCode.includes("describe(")) {
				feedback.push("🏗️ Use describe() blocks to organize tests better");
			}
		}

		if (executionResult.success && scores.overall >= 80) {
			feedback.push("✅ Good test quality - well structured and comprehensive");
		}

		return feedback.join(". ");
	}
}