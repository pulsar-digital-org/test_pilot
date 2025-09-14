import { RealTestExecutor } from "../../execution/real-test-executor";
import type { ExecutorNode, ExecutionContext } from "../types";
import type { ExecutionResult } from "../../execution/types";
import type { Result } from "../../../types/misc";

export class TestExecutorNode implements ExecutorNode {
	readonly type = "executor" as const;
	readonly name = "test-executor";

	private readonly realExecutor: RealTestExecutor;

	constructor(projectRoot: string = process.cwd()) {
		this.realExecutor = new RealTestExecutor({
			timeout: 30000, // 30 seconds for real test execution
			projectRoot,
			testFramework: "auto", // Auto-detect vitest/jest
			cleanupTempFiles: true,
		});
	}

	async execute(testCode: string, context: ExecutionContext): Promise<Result<ExecutionResult>> {
		try {
			const testFileName = `${context.functionName}.test.ts`;

			// Execute the test using real test framework
			const result = await this.realExecutor.executeTest(testCode, testFileName);

			if (!result.ok) {
				return { ok: false, error: result.error };
			}

			return { ok: true, value: result.value };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	/**
	 * Quick syntax validation by attempting compilation
	 */
	async validateOnly(testCode: string): Promise<Result<boolean>> {
		try {
			// Create a minimal test that only checks syntax
			const syntaxCheckCode = `
// Syntax validation only - no actual test execution
${testCode}
// Add a dummy test to make it valid
if (false) {
	console.log("syntax check");
}
			`;

			const result = await this.realExecutor.executeTest(syntaxCheckCode, "syntax-check.test.ts");

			if (!result.ok) {
				return { ok: false, error: result.error };
			}

			// Check if there are any syntax or import errors
			const hasErrors = result.value.errors?.some(
				(error) => error.type === "syntax_error" || error.type === "import_error"
			);

			return { ok: true, value: !hasErrors };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	/**
	 * Get execution metrics for analysis
	 */
	getExecutionMetrics(executionResult: ExecutionResult): ExecutionMetrics {
		return {
			executionTime: executionResult.executionTime,
			success: executionResult.success,
			errorCount: executionResult.errors?.length || 0,
			errorTypes: executionResult.errors?.map(e => e.type) || [],
			hasOutput: Boolean(executionResult.stdout && executionResult.stdout.length > 0),
			outputLength: executionResult.stdout?.length || 0,
			testsRun: (executionResult.output as any)?.testsRun || 0,
			testsPassed: (executionResult.output as any)?.testsPassed || 0,
			testsFailed: (executionResult.output as any)?.testsFailed || 0,
		};
	}
}

export interface ExecutionMetrics {
	readonly executionTime: number;
	readonly success: boolean;
	readonly errorCount: number;
	readonly errorTypes: string[];
	readonly hasOutput: boolean;
	readonly outputLength: number;
	readonly testsRun: number;
	readonly testsPassed: number;
	readonly testsFailed: number;
}