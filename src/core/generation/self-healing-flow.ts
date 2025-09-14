import { TestGeneratorNode } from "./nodes/generator-node";
import { TestValidatorNode } from "./nodes/validator-node";
import { TestExecutorNode } from "./nodes/executor-node";
import { TestScorerNode } from "./nodes/scorer-node";
import { TestFixerNode } from "./nodes/fixer-node";

import type { AIConnector } from "../ai";
import type { FunctionInfo } from "../../types/discovery";
import type {
	GenerationState,
	FlowResult,
	FlowIteration,
	QualityScore,
} from "./types";
import type { Result } from "../../types/misc";

export interface SelfHealingFlowConfig {
	readonly maxAttempts: number;
	readonly qualityThreshold: number; // 0-100
	readonly projectRoot: string;
	readonly enableLLMScoring: boolean;
	readonly enableLLMFixing: boolean;
}

const DEFAULT_CONFIG: SelfHealingFlowConfig = {
	maxAttempts: 5,
	qualityThreshold: 75,
	projectRoot: process.cwd(),
	enableLLMScoring: true,
	enableLLMFixing: true,
};

export class SelfHealingTestFlow {
	private readonly config: SelfHealingFlowConfig;
	private readonly generator: TestGeneratorNode;
	private readonly validator: TestValidatorNode;
	private readonly executor: TestExecutorNode;
	private readonly scorer: TestScorerNode;
	private readonly fixer: TestFixerNode;

	constructor(aiConnector: AIConnector, config: Partial<SelfHealingFlowConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		this.generator = new TestGeneratorNode(aiConnector);
		this.validator = new TestValidatorNode();
		this.executor = new TestExecutorNode(this.config.projectRoot);
		this.scorer = new TestScorerNode(aiConnector);
		this.fixer = new TestFixerNode(aiConnector);
	}

	async generate(
		functionInfo: FunctionInfo,
		systemPrompt: string,
		userPrompt: string,
	): Promise<Result<FlowResult>> {
		const startTime = Date.now();
		const iterations: FlowIteration[] = [];

		let state: GenerationState = {
			functionInfo,
			systemPrompt,
			userPrompt,
			attempts: 0,
			maxAttempts: this.config.maxAttempts,
		};

		try {
			// Main self-healing loop
			while (state.attempts < this.config.maxAttempts) {
				state = { ...state, attempts: state.attempts + 1 };
				const iterationStart = Date.now();

				console.log(`   🔄 Flow iteration ${state.attempts}/${this.config.maxAttempts}`);

				// Step 1: Generate test
				const generateResult = await this.generator.generate(state);
				if (!generateResult.ok) {
					console.log(`   ❌ Generation failed: ${generateResult.error.message}`);
					continue;
				}

				const generatedTest = generateResult.value.code;
				console.log(`   ✅ Generated test (confidence: ${Math.round(generateResult.value.confidence * 100)}%)`);

				// Step 2: Validate test
				const validateResult = await this.validator.validate(generatedTest);
				if (!validateResult.ok) {
					console.log(`   ❌ Validation error: ${validateResult.error.message}`);
					continue;
				}

				const validation = validateResult.value;
				console.log(`   📋 Validation: ${validation.isValid ? 'PASS' : 'FAIL'} (${validation.issues.length} issues)`);

				// If validation fails, try to fix and continue
				if (!validation.isValid) {
					const fixResult = await this.tryFix(generatedTest, validation.issues, functionInfo);
					if (fixResult.ok) {
						console.log(`   🔧 Applied fixes, retrying...`);
						state = { ...state, issues: validation.issues };

						iterations.push({
							attempt: state.attempts,
							generatedCode: generatedTest,
							validationResult: validation,
							appliedFixes: ["Validation fixes applied"],
							timestamp: Date.now() - iterationStart,
						});
						continue;
					}
				}

				// Step 3: Execute test
				const executeResult = await this.executor.execute(generatedTest, {
					functionPath: functionInfo.filePath,
					functionName: functionInfo.name,
					projectRoot: this.config.projectRoot,
				});

				if (!executeResult.ok) {
					console.log(`   ❌ Execution failed: ${executeResult.error.message}`);
					iterations.push({
						attempt: state.attempts,
						generatedCode: generatedTest,
						validationResult: validation,
						timestamp: Date.now() - iterationStart,
					});
					continue;
				}

				const executionResult = executeResult.value;
				console.log(`   🧪 Execution: ${executionResult.success ? 'PASS' : 'FAIL'} (${executionResult.executionTime}ms)`);

				// Debug logging
				if (!executionResult.success) {
					console.log(`   🐛 Debug - Execution failed:`, {
						errors: executionResult.errors?.length,
						output: executionResult.output,
						firstError: executionResult.errors?.[0]
					});
				}

				// Step 4: Score test quality
				let qualityScore: QualityScore | undefined;
				if (this.config.enableLLMScoring) {
					const scoreResult = await this.scorer.score(generatedTest, executionResult, functionInfo);
					if (scoreResult.ok) {
						qualityScore = scoreResult.value;
						console.log(`   📊 Quality score: ${qualityScore.overall}/100 (${qualityScore.feedback.substring(0, 50)}...)`);
					}
				}

				// Record this iteration
				const iteration: FlowIteration = {
					attempt: state.attempts,
					generatedCode: generatedTest,
					validationResult: validation,
					executionResult,
					qualityScore,
					timestamp: Date.now() - iterationStart,
				};
				iterations.push(iteration);

				// Step 5: Check if we should accept this test
				const shouldAccept = this.shouldAcceptTest(validation, executionResult, qualityScore);

				if (shouldAccept) {
					console.log(`   ✅ Test accepted! Quality threshold met.`);

					const result: FlowResult = {
						success: true,
						finalTest: generatedTest,
						qualityScore,
						attempts: state.attempts,
						executionTime: Date.now() - startTime,
						iterations,
					};

					return { ok: true, value: result };
				}

				// Step 6: If not acceptable, try to improve for next iteration
				if (state.attempts < this.config.maxAttempts) {
					console.log(`   📈 Quality below threshold, improving for next iteration...`);

					// Collect issues for next iteration
					const issues: string[] = [];
					if (!validation.isValid) {
						issues.push(...validation.issues);
					}
					if (!executionResult.success && executionResult.errors?.length) {
						issues.push(...executionResult.errors.map(e => `${e.type}: ${e.message}`));
					}
					if (qualityScore && qualityScore.overall < this.config.qualityThreshold) {
						issues.push(`Quality score ${qualityScore.overall} below threshold ${this.config.qualityThreshold}`);
						issues.push(qualityScore.feedback);
					}

					state = {
						...state,
						generatedTest,
						executionResult,
						qualityScore,
						issues,
					};
				}
			}

			// If we get here, we've exhausted all attempts
			console.log(`   ⚠️  Max attempts reached without meeting quality threshold`);

			const result: FlowResult = {
				success: false,
				attempts: state.attempts,
				executionTime: Date.now() - startTime,
				iterations,
			};

			return { ok: true, value: result };

		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private shouldAcceptTest(
		validation: { isValid: boolean; issues: string[] },
		executionResult: { success: boolean; errors?: unknown[] },
		qualityScore?: QualityScore,
	): boolean {
		// Must pass validation
		if (!validation.isValid) {
			return false;
		}

		// Must execute successfully
		if (!executionResult.success) {
			return false;
		}

		// Must meet quality threshold if scoring is enabled
		if (this.config.enableLLMScoring && qualityScore) {
			if (qualityScore.overall < this.config.qualityThreshold) {
				return false;
			}
		}

		return true;
	}

	private async tryFix(
		testCode: string,
		issues: string[],
		functionInfo: FunctionInfo,
	): Promise<Result<string>> {
		if (!this.config.enableLLMFixing) {
			return { ok: false, error: new Error("LLM fixing is disabled") };
		}

		return this.fixer.fix(testCode, issues, functionInfo);
	}

	/**
	 * Get flow configuration
	 */
	getConfig(): SelfHealingFlowConfig {
		return { ...this.config };
	}

	/**
	 * Update flow configuration
	 */
	updateConfig(updates: Partial<SelfHealingFlowConfig>): void {
		Object.assign(this.config, updates);
	}
}