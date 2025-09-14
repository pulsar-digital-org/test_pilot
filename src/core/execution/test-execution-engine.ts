import { ASTExecutor } from "./ast-executor";
import { ASTImportResolver } from "./import-resolver";
import { ErrorAnalyzer } from "./error-analyzer";
import type {
	ExecutionContext,
	ExecutionResult,
	ExecutionOptions,
	IASTExecutor,
} from "./types";
import type {
	ErrorAnalysisResult,
	FixRecommendation,
	AnalyzedError,
} from "./error-analyzer";
import type { ProjectImportResolver } from "./import-resolver";
import type { Result } from "../../types/misc";

export interface TestExecutionRequest {
	readonly testCode: string;
	readonly fileName?: string;
	readonly projectRoot?: string;
	readonly options?: ExecutionOptions;
	readonly context?: {
		readonly functionUnderTest?: string;
		readonly imports?: string[];
		readonly mocks?: Record<string, unknown>;
	};
}

export interface TestExecutionResponse {
	readonly success: boolean;
	readonly executionResult: ExecutionResult;
	readonly errorAnalysis?: ErrorAnalysisResult;
	readonly fixRecommendations?: readonly FixRecommendation[];
	readonly iterations: readonly ExecutionIteration[];
}

export interface ExecutionIteration {
	readonly attempt: number;
	readonly code: string;
	readonly result: ExecutionResult;
	readonly errorAnalysis?: ErrorAnalysisResult;
	readonly appliedFixes?: readonly string[];
}

export interface TestIterationConfig {
	readonly maxAttempts: number;
	readonly enableAutoFix: boolean;
	readonly fixConfidenceThreshold: number;
	readonly timeoutPerAttempt: number;
}

const DEFAULT_ITERATION_CONFIG: TestIterationConfig = {
	maxAttempts: 3,
	enableAutoFix: true,
	fixConfidenceThreshold: 0.7,
	timeoutPerAttempt: 10000,
};

export class TestExecutionEngine {
	private readonly executor: IASTExecutor;
	private readonly importResolver: ProjectImportResolver;
	private readonly errorAnalyzer: ErrorAnalyzer;
	private readonly iterationConfig: TestIterationConfig;

	constructor(
		projectRoot: string = process.cwd(),
		iterationConfig: Partial<TestIterationConfig> = {},
	) {
		this.executor = new ASTExecutor({
			timeout: iterationConfig.timeoutPerAttempt || DEFAULT_ITERATION_CONFIG.timeoutPerAttempt,
			mockExternalDependencies: true,
			captureConsole: true,
			isolateGlobals: true,
		});
		this.importResolver = new ASTImportResolver(projectRoot);
		this.errorAnalyzer = new ErrorAnalyzer();
		this.iterationConfig = { ...DEFAULT_ITERATION_CONFIG, ...iterationConfig };
	}

	async executeTest(request: TestExecutionRequest): Promise<Result<TestExecutionResponse>> {
		try {
			const iterations: ExecutionIteration[] = [];
			let currentCode = request.testCode;
			let attempt = 1;

			while (attempt <= this.iterationConfig.maxAttempts) {
				// Execute current version
				const executionResult = await this.executeSingleAttempt(
					currentCode,
					request.fileName || `test-${Date.now()}.ts`,
					request.context,
				);

				if (!executionResult.ok) {
					return { ok: false, error: executionResult.error };
				}

				const result = executionResult.value;

				// Analyze errors if execution failed
				let errorAnalysis: ErrorAnalysisResult | undefined;
				let fixRecommendations: FixRecommendation[] | undefined;
				let appliedFixes: string[] | undefined;

				if (!result.success && result.errors) {
					const analysisResult = this.errorAnalyzer.analyzeErrors(result.errors);
					if (analysisResult.ok) {
						errorAnalysis = analysisResult.value;
						fixRecommendations = this.errorAnalyzer.getFixRecommendations(errorAnalysis);
					}
				}

				// Record this iteration
				const iteration: ExecutionIteration = {
					attempt,
					code: currentCode,
					result,
					errorAnalysis,
					appliedFixes,
				};
				iterations.push(iteration);

				// If successful or last attempt, return results
				if (result.success || attempt >= this.iterationConfig.maxAttempts) {
					const response: TestExecutionResponse = {
						success: result.success,
						executionResult: result,
						errorAnalysis,
						fixRecommendations,
						iterations,
					};

					return { ok: true, value: response };
				}

				// Try to auto-fix errors for next iteration
				if (this.iterationConfig.enableAutoFix && errorAnalysis && fixRecommendations) {
					const fixResult = await this.attemptAutoFix(
						currentCode,
						errorAnalysis,
						fixRecommendations,
					);

					if (fixResult.ok) {
						currentCode = fixResult.value.fixedCode;
						appliedFixes = fixResult.value.appliedFixes;
						iterations[iterations.length - 1].appliedFixes = appliedFixes;
					}
				}

				attempt++;
			}

			// Should not reach here, but return the last iteration's result
			const lastIteration = iterations[iterations.length - 1];
			const response: TestExecutionResponse = {
				success: false,
				executionResult: lastIteration.result,
				errorAnalysis: lastIteration.errorAnalysis,
				fixRecommendations: lastIteration.errorAnalysis
					? this.errorAnalyzer.getFixRecommendations(lastIteration.errorAnalysis)
					: undefined,
				iterations,
			};

			return { ok: true, value: response };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private async executeSingleAttempt(
		code: string,
		fileName: string,
		context?: TestExecutionRequest["context"],
	): Promise<Result<ExecutionResult>> {
		const executionContext: ExecutionContext = {
			sourceCode: code,
			fileName,
			globalMocks: context?.mocks,
		};

		return await this.executor.execute(executionContext);
	}

	private async attemptAutoFix(
		code: string,
		errorAnalysis: ErrorAnalysisResult,
		recommendations: readonly FixRecommendation[],
	): Promise<Result<{ fixedCode: string; appliedFixes: string[] }>> {
		try {
			let fixedCode = code;
			const appliedFixes: string[] = [];

			// Sort recommendations by confidence (highest first)
			const sortedRecommendations = [...recommendations]
				.filter((rec) => rec.confidence >= this.iterationConfig.fixConfidenceThreshold)
				.sort((a, b) => b.confidence - a.confidence);

			for (const recommendation of sortedRecommendations) {
				if (!recommendation.automated) {
					continue; // Skip non-automated fixes
				}

				const fixResult = await this.applyAutomatedFix(fixedCode, recommendation, errorAnalysis);
				if (fixResult.ok) {
					fixedCode = fixResult.value;
					appliedFixes.push(recommendation.description);
				}
			}

			return {
				ok: true,
				value: {
					fixedCode,
					appliedFixes,
				},
			};
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private async applyAutomatedFix(
		code: string,
		recommendation: FixRecommendation,
		errorAnalysis: ErrorAnalysisResult,
	): Promise<Result<string>> {
		try {
			switch (recommendation.type) {
				case "add_import":
					return this.fixMissingImport(code, recommendation, errorAnalysis);

				case "fix_import_path":
					return this.fixImportPath(code, recommendation, errorAnalysis);

				case "fix_syntax":
					return this.fixSyntaxError(code, recommendation);

				default:
					return { ok: false, error: new Error(`Unsupported fix type: ${recommendation.type}`) };
			}
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private async fixMissingImport(
		code: string,
		recommendation: FixRecommendation,
		errorAnalysis: ErrorAnalysisResult,
	): Promise<Result<string>> {
		// Find the missing import from error analysis
		const importError = errorAnalysis.analyzedErrors.find(
			(error) => error.category === "missing_import",
		);

		if (!importError) {
			return { ok: false, error: new Error("No import error found to fix") };
		}

		// Extract module name from error message
		const moduleMatch = importError.message.match(/Cannot resolve module '([^']+)'/);
		if (!moduleMatch) {
			return { ok: false, error: new Error("Could not extract module name from error") };
		}

		const moduleName = moduleMatch[1];

		// Add import at the top of the file
		const importStatement = this.generateImportStatement(moduleName);
		const lines = code.split("\n");

		// Find insertion point (after existing imports)
		let insertIndex = 0;
		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim().startsWith("import ")) {
				insertIndex = i + 1;
			} else if (lines[i].trim() === "") {
				continue;
			} else {
				break;
			}
		}

		lines.splice(insertIndex, 0, importStatement);
		return { ok: true, value: lines.join("\n") };
	}

	private async fixImportPath(
		code: string,
		recommendation: FixRecommendation,
		errorAnalysis: ErrorAnalysisResult,
	): Promise<Result<string>> {
		// This would implement import path correction logic
		// For now, return unchanged code
		return { ok: true, value: code };
	}

	private async fixSyntaxError(
		code: string,
		recommendation: FixRecommendation,
	): Promise<Result<string>> {
		// Basic syntax error fixes could be implemented here
		// For now, return unchanged code
		return { ok: true, value: code };
	}

	private generateImportStatement(moduleName: string): string {
		// Generate appropriate import statement based on module name
		if (moduleName === "vitest") {
			return "import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';";
		}

		if (moduleName === "@jest/globals") {
			return "import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';";
		}

		if (moduleName.startsWith("node:") || this.isNodeBuiltin(moduleName)) {
			return `import ${this.getNodeBuiltinImport(moduleName)} from '${moduleName}';`;
		}

		// Default: named import with common names
		return `import { ${this.guessImportNames(moduleName)} } from '${moduleName}';`;
	}

	private isNodeBuiltin(moduleName: string): boolean {
		const builtins = ["fs", "path", "os", "crypto", "util", "events", "stream"];
		return builtins.includes(moduleName);
	}

	private getNodeBuiltinImport(moduleName: string): string {
		const cleanName = moduleName.replace("node:", "");
		switch (cleanName) {
			case "fs":
				return "{ readFileSync, writeFileSync, existsSync }";
			case "path":
				return "{ join, resolve, dirname, basename }";
			default:
				return `* as ${cleanName}`;
		}
	}

	private guessImportNames(moduleName: string): string {
		// Simple heuristic to guess likely import names
		const baseName = moduleName.split("/").pop() || moduleName;
		return baseName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
	}

	/**
	 * Get detailed execution metrics
	 */
	getExecutionMetrics(response: TestExecutionResponse): ExecutionMetrics {
		const totalTime = response.iterations.reduce(
			(sum, iteration) => sum + iteration.result.executionTime,
			0,
		);

		const errorTypes = new Set<string>();
		let totalErrors = 0;

		for (const iteration of response.iterations) {
			if (iteration.result.errors) {
				totalErrors += iteration.result.errors.length;
				iteration.result.errors.forEach((error) => errorTypes.add(error.type));
			}
		}

		return {
			totalIterations: response.iterations.length,
			totalExecutionTime: totalTime,
			successfulIteration: response.iterations.findIndex((iter) => iter.result.success) + 1,
			totalErrors,
			uniqueErrorTypes: Array.from(errorTypes),
			autoFixesApplied: response.iterations.reduce(
				(sum, iter) => sum + (iter.appliedFixes?.length || 0),
				0,
			),
		};
	}
}

export interface ExecutionMetrics {
	readonly totalIterations: number;
	readonly totalExecutionTime: number;
	readonly successfulIteration: number; // 0 if none succeeded
	readonly totalErrors: number;
	readonly uniqueErrorTypes: string[];
	readonly autoFixesApplied: number;
}