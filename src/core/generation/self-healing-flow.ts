import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { AxFlow, AxMockAIService, axCreateFlowTextLogger } from "@ax-llm/ax";

import { TestGeneratorNode } from "./nodes/generator-node";
import { TestValidatorNode } from "./nodes/validator-node";
import { TestExecutorNode } from "./nodes/executor-node";
import { TestScorerNode } from "./nodes/scorer-node";

import type { AIConnector } from "../ai";
import type { FunctionInfo } from "../../types/discovery";
import type {
	GenerationState,
	FlowResult,
	FlowIteration,
	QualityScore,
	ValidationResult,
} from "./types";
import type { ExecutionResult } from "../execution/types";
import type { Result } from "../../types/misc";

interface FlowInputState {
	readonly functionInfo: FunctionInfo;
	readonly systemPrompt: string;
	readonly userPrompt: string;
	readonly outputPath: string;
	readonly maxAttempts: number;
	readonly qualityThreshold: number;
}

interface FlowWorkingState extends FlowInputState {
	readonly startTime: number;
	readonly attempts: number;
	readonly issues: readonly string[];
	readonly generatedTest?: string;
	readonly validationResult?: ValidationResult;
	readonly executionResult?: ExecutionResult;
	readonly qualityScore?: QualityScore;
	readonly iterations: readonly FlowIteration[];
	readonly accepted: boolean;
	readonly terminated: boolean;
	readonly savedTo?: string;
	readonly improvement?: string;
	readonly executionTime: number;
	readonly objective?: string;
	readonly consecutiveValidationFailures: number;
	readonly consecutiveExecutionFailures: number;
}

export interface SelfHealingFlowConfig {
	readonly maxAttempts: number;
	readonly qualityThreshold: number; // 0-100
	readonly projectRoot?: string;
	readonly enableFlowLogging?: boolean;
	readonly maxValidationFailures?: number;
	readonly maxExecutionFailures?: number;
}

const DEFAULT_CONFIG: Required<Omit<SelfHealingFlowConfig, "enableFlowLogging">> & Pick<SelfHealingFlowConfig, "enableFlowLogging"> = {
	maxAttempts: 5,
	qualityThreshold: 75,
	projectRoot: process.cwd(),
	enableFlowLogging: false,
	maxValidationFailures: 3,
	maxExecutionFailures: 3,
};

export class SelfHealingTestFlow {
	private readonly config: typeof DEFAULT_CONFIG;
	private readonly generator: TestGeneratorNode;
	private readonly validator: TestValidatorNode;
	private readonly executor: TestExecutorNode;
	private readonly scorer: TestScorerNode;

	constructor(aiConnector: AIConnector, config: Partial<SelfHealingFlowConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };

		this.generator = new TestGeneratorNode(aiConnector);
		this.validator = new TestValidatorNode();
		this.executor = new TestExecutorNode(this.config.projectRoot);
		this.scorer = new TestScorerNode(aiConnector);
	}

	async generate(
		functionInfo: FunctionInfo,
		systemPrompt: string,
		userPrompt: string,
		outputPath: string,
	): Promise<Result<FlowResult>> {
		const startTime = Date.now();
		let state: FlowWorkingState = {
			functionInfo,
			systemPrompt,
			userPrompt,
			outputPath,
			maxAttempts: this.config.maxAttempts,
			qualityThreshold: this.config.qualityThreshold,
			attempts: 0,
			issues: [],
			iterations: [],
			accepted: false,
			terminated: false,
			executionTime: 0,
			startTime,
			consecutiveValidationFailures: 0,
			consecutiveExecutionFailures: 0,
		};

		try {
			// Manual iteration loop for reliable test generation with quality assurance
			while (!state.accepted && !state.terminated && state.attempts < state.maxAttempts) {
				// Run all steps sequentially
				state = await this.runGenerationStep(state);
				state = await this.runValidationStep(state);
				state = await this.runExecutionStep(state);
				state = await this.runScoringStep(state);
				state = await this.applyDecisionStep(state);
			}

			const finalState = {
				...state,
				executionTime: Date.now() - startTime,
			};

			const result: FlowResult = {
				success: finalState.accepted,
				finalTest: finalState.accepted ? finalState.generatedTest : undefined,
				qualityScore: finalState.qualityScore,
				attempts: finalState.attempts,
				executionTime: finalState.executionTime,
				iterations: finalState.iterations,
				savedTo: finalState.savedTo,
				improvement: finalState.accepted ? undefined : finalState.improvement,
			};

			return { ok: true, value: result };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private createFlow(): AxFlow<FlowInputState, FlowWorkingState> {
		const flow = AxFlow.create<FlowInputState, FlowWorkingState>({
			logger: this.config.enableFlowLogging ? axCreateFlowTextLogger() : undefined,
		});

		return flow
			.map((state) => this.initializeState(state))
			.while(
				(state) => {
					const shouldContinue = !state.accepted && !state.terminated && state.attempts < state.maxAttempts;
					console.log(`🔄 While condition: accepted=${state.accepted}, terminated=${state.terminated}, attempts=${state.attempts}/${state.maxAttempts} -> continue=${shouldContinue}`);
					return shouldContinue;
				}
			)
			.map(async (state) => {
				console.log(`🚀 Starting iteration with attempts=${state.attempts}`);
				// Run all steps sequentially within the while loop
				let currentState = await this.runGenerationStep(state);
				console.log(`✅ Generation: attempts=${currentState.attempts}, hasTest=${!!currentState.generatedTest}`);
				currentState = await this.runValidationStep(currentState);
				console.log(`✅ Validation: valid=${currentState.validationResult?.isValid}, terminated=${currentState.terminated}`);
				currentState = await this.runExecutionStep(currentState);
				console.log(`✅ Execution: success=${currentState.executionResult?.success}, terminated=${currentState.terminated}`);
				currentState = await this.runScoringStep(currentState);
				console.log(`✅ Scoring: score=${currentState.qualityScore?.overall}, terminated=${currentState.terminated}`);
				currentState = await this.applyDecisionStep(currentState);
				console.log(`✅ Decision: accepted=${currentState.accepted}, terminated=${currentState.terminated}, iterations=${currentState.iterations.length}`);
				return currentState;
			})
			.endWhile()
			.map((state) => ({
				...state,
				executionTime: Date.now() - state.startTime,
			}))
			.returns((state) => state);
	}

	private initializeState(state: FlowInputState): FlowWorkingState {
		return {
			...state,
			attempts: 0,
			issues: [],
			iterations: [],
			accepted: false,
			terminated: false,
			executionTime: 0,
			startTime: Date.now(),
			consecutiveValidationFailures: 0,
			consecutiveExecutionFailures: 0,
		};
	}

	private async runGenerationStep(state: FlowWorkingState): Promise<FlowWorkingState> {
		if (state.terminated || state.accepted) {
			return state;
		}

		const nextAttempt = state.attempts + 1;
		const objective = this.getObjectiveForAttempt(nextAttempt);
		const generationState: GenerationState = {
			functionInfo: state.functionInfo,
			systemPrompt: state.systemPrompt,
			userPrompt: state.userPrompt,
			attempts: nextAttempt,
			maxAttempts: state.maxAttempts,
			issues: state.issues.length ? [...state.issues] : undefined,
			qualityScore: state.qualityScore,
			validationResult: state.validationResult,
			executionResult: state.executionResult,
			objective,
		};

		const generationResult = await this.generator.generate(generationState);
		if (!generationResult.ok) {
			const message = generationResult.error.message || "Unknown generation error";
			return {
				...state,
				attempts: nextAttempt,
				generatedTest: undefined,
				qualityScore: undefined,
				validationResult: undefined,
				executionResult: undefined,
				issues: [message],
				improvement: message,
				terminated: true,
				objective,
			};
		}

		return {
			...state,
			attempts: nextAttempt,
			generatedTest: generationResult.value.code,
			qualityScore: undefined,
			validationResult: undefined,
			executionResult: undefined,
			issues: [],
			improvement: undefined,
			terminated: false,
			objective,
		};
	}

	private async runValidationStep(state: FlowWorkingState): Promise<FlowWorkingState> {
		if (state.terminated || state.accepted || !state.generatedTest) {
			return state;
		}

		const validation = await this.validator.validate(state.generatedTest);
		if (!validation.ok) {
			const message = validation.error.message || "Validation engine failed";
			return {
				...state,
				validationResult: undefined,
				executionResult: undefined,
				qualityScore: undefined,
				issues: [message],
				improvement: message,
				terminated: true,
			};
		}

		const validationResult = validation.value;
		let issues = [...state.issues];
		let improvement = state.improvement;
		let terminated = state.terminated;
		const consecutiveValidationFailures = validationResult.isValid
			? 0
			: state.consecutiveValidationFailures + 1;

		if (!validationResult.isValid) {
			const formatted = this.formatValidationIssues(validationResult);
			issues = [...issues, ...formatted];
			improvement = formatted.join("\n");
			if (consecutiveValidationFailures >= this.config.maxValidationFailures) {
				terminated = true;
			}
		}

		return {
			...state,
			validationResult,
			executionResult: undefined,
			qualityScore: undefined,
			issues,
			improvement,
			terminated,
			consecutiveValidationFailures,
		};
	}

	private async runExecutionStep(state: FlowWorkingState): Promise<FlowWorkingState> {
		if (
			state.terminated ||
			state.accepted ||
			!state.generatedTest ||
			!state.validationResult ||
			!state.validationResult.isValid
		) {
			return state;
		}

		const execution = await this.executor.execute(state.generatedTest, {
			functionPath: state.functionInfo.filePath,
			functionName: state.functionInfo.name,
			projectRoot: this.config.projectRoot,
		});

		if (!execution.ok) {
			const message = execution.error.message || "Test execution failed";
			return {
				...state,
				executionResult: undefined,
				qualityScore: undefined,
				issues: [...state.issues, message],
				improvement: message,
				terminated: true,
			};
		}

		const executionResult = execution.value;
		let issues = [...state.issues];
		let improvement = state.improvement;
		let terminated = state.terminated;
		const consecutiveExecutionFailures = executionResult.success
			? 0
			: state.consecutiveExecutionFailures + 1;

		if (!executionResult.success) {
			const formatted = this.formatExecutionErrors(executionResult);
			issues = [...issues, ...formatted];
			improvement = formatted.join("\n");
			if (consecutiveExecutionFailures >= this.config.maxExecutionFailures) {
				terminated = true;
			}
		}

		return {
			...state,
			executionResult,
			issues,
			improvement,
			terminated,
			consecutiveExecutionFailures,
		};
	}

	private async runScoringStep(state: FlowWorkingState): Promise<FlowWorkingState> {
		if (
			state.terminated ||
			state.accepted ||
			!state.generatedTest ||
			!state.validationResult ||
			!state.validationResult.isValid
		) {
			return state;
		}

		if (!state.executionResult) {
			// Skip scoring until we have an execution result
			return state;
		}

		const scoreResult = await this.scorer.score(
			state.generatedTest,
			state.executionResult,
			state.functionInfo,
		);

		if (!scoreResult.ok) {
			const message = scoreResult.error.message || "Unable to score generated test";
			return {
				...state,
				qualityScore: undefined,
				issues: [...state.issues, message],
				improvement: message,
				terminated: true,
			};
		}

		return {
			...state,
			qualityScore: scoreResult.value,
		};
	}

	private async applyDecisionStep(state: FlowWorkingState): Promise<FlowWorkingState> {
		const iterations: FlowIteration[] = [
			...state.iterations,
			{
				attempt: state.attempts,
				generatedCode: state.generatedTest,
				validationResult: state.validationResult,
				executionResult: state.executionResult,
				qualityScore: state.qualityScore,
				timestamp: Date.now() - state.startTime,
				feedback: state.qualityScore?.feedback,
			},
		];

		const improvementMessage = this.buildImprovementMessage(
			state.qualityScore,
			state.qualityThreshold,
			state.validationResult,
			state.executionResult,
		);

		const issuesForNextAttempt = improvementMessage
			? improvementMessage
					.split("\n")
					.map((line) => line.trim())
					.filter((line) => line.length > 0)
			: [];

		if (!state.generatedTest || !state.validationResult || !state.validationResult.isValid) {
			return {
				...state,
				iterations,
				issues: issuesForNextAttempt,
				improvement: improvementMessage || state.improvement,
			};
		}

		if (!state.executionResult || !state.executionResult.success) {
			return {
				...state,
				iterations,
				issues: issuesForNextAttempt,
				improvement: improvementMessage || state.improvement,
			};
		}

		if (!state.qualityScore) {
			return {
				...state,
				iterations,
				issues: issuesForNextAttempt,
				improvement: improvementMessage || state.improvement,
			};
		}

		if (state.qualityScore.overall >= state.qualityThreshold) {
			const savedTo = await this.persistTest(state.outputPath, state.generatedTest);
			return {
				...state,
				iterations,
				accepted: true,
				savedTo,
				issues: [],
				improvement: undefined,
			};
		}

		return {
			...state,
			iterations,
			issues: issuesForNextAttempt,
			improvement: improvementMessage,
		};
	}

	private async persistTest(outputPath: string, code: string): Promise<string> {
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, code, "utf8");
		return outputPath;
	}

	private buildImprovementMessage(
		score: QualityScore | undefined,
		threshold: number,
		validation?: ValidationResult,
		execution?: ExecutionResult,
	): string {
		const hints: string[] = [];

		if (validation && !validation.isValid) {
			hints.push(...this.formatValidationIssues(validation));
		}

		if (execution && !execution.success) {
			hints.push(...this.formatExecutionErrors(execution));
		}

		if (score) {
			const coverageGap = score.coverage < threshold;
			const correctnessGap = score.correctness < threshold;
			const completenessGap = score.completeness < threshold;
			const maintainabilityGap = score.maintainability < threshold;

			if (score.feedback?.trim()) {
				hints.push(score.feedback.trim());
			}
			if (coverageGap) {
				hints.push("Expand coverage with boundary conditions and additional scenarios.");
			}
			if (correctnessGap) {
				hints.push("Ensure expectations align with the implementation and correct any syntax issues.");
			}
			if (completenessGap) {
				hints.push("Add more comprehensive tests for alternate branches and error handling.");
			}
			if (maintainabilityGap) {
				hints.push("Refine test structure, naming, and reuse setup to keep tests maintainable.");
			}
		}

		if (!hints.length) {
			hints.push(
				`Quality score${score ? ` ${score.overall}` : ""} is below the threshold ${threshold}. Strengthen assertions and add diverse scenarios.`,
			);
		}

		return hints.join("\n");
	}

	private formatValidationIssues(validation: ValidationResult): string[] {
		const messages: string[] = [];
		if (validation.issues.length) {
			validation.issues.forEach((issue, index) => {
				messages.push(`Validation issue ${index + 1}: ${issue}`);
			});
		}
		if (validation.syntaxErrors?.length) {
			messages.push(`Syntax errors: ${validation.syntaxErrors.join(", ")}`);
		}
		if (validation.importErrors?.length) {
			messages.push(`Import issues: ${validation.importErrors.join(", ")}`);
		}
		return messages.length ? messages : ["Fix validation issues detected in the previous attempt."];
	}

	private formatExecutionErrors(execution: ExecutionResult): string[] {
		if (!execution.errors?.length) {
			return ["Tests failed to run successfully. Investigate runtime behaviour and expectations."];
		}

		return execution.errors.map((error, index) => {
			const location =
				error.line !== undefined
					? ` (line ${error.line}${error.column ? `, col ${error.column}` : ""})`
					: "";
			return `Execution issue ${index + 1}: ${error.type}${location} – ${error.message}`;
		});
	}

	private getObjectiveForAttempt(attempt: number): string {
		switch (attempt) {
			case 1:
				return "Start with a passing happy-path test that demonstrates core behaviour.";
			case 2:
				return "Add edge cases and boundary conditions covering unusual inputs and state.";
			case 3:
				return "Include error-handling scenarios and verify thrown errors or rejected promises.";
			default:
				return "Incorporate asynchronous flows, mocks/spies, and regression tests to maximise coverage.";
		}
	}
}
