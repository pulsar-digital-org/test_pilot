import { TestExecutionEngine } from "../core/execution";
import type {
	TestExecutionRequest,
	TestExecutionResponse,
} from "../core/execution";

/**
 * Example demonstrating the AST-based test execution system
 */
export class TestExecutionExample {
	private readonly engine: TestExecutionEngine;

	constructor(projectRoot: string = process.cwd()) {
		this.engine = new TestExecutionEngine(projectRoot, {
			maxAttempts: 3,
			enableAutoFix: true,
			fixConfidenceThreshold: 0.7,
			timeoutPerAttempt: 5000,
		});
	}

	/**
	 * Example 1: Simple passing test
	 */
	async runSimplePassingTest(): Promise<TestExecutionResponse> {
		const testCode = `
import { describe, test, expect } from 'vitest';

describe('Calculator', () => {
  test('should add two numbers', () => {
    const result = 2 + 2;
    expect(result).toBe(4);
  });
});`;

		const request: TestExecutionRequest = {
			testCode,
			fileName: "calculator.test.ts",
			context: {
				functionUnderTest: "add",
			},
		};

		const result = await this.engine.executeTest(request);
		if (!result.ok) {
			throw result.error;
		}

		return result.value;
	}

	/**
	 * Example 2: Test with missing import (will be auto-fixed)
	 */
	async runTestWithMissingImport(): Promise<TestExecutionResponse> {
		const testCode = `
describe('Calculator', () => {
  test('should add two numbers', () => {
    const result = 2 + 2;
    expect(result).toBe(4);
  });
});`;

		const request: TestExecutionRequest = {
			testCode,
			fileName: "calculator-missing-import.test.ts",
		};

		const result = await this.engine.executeTest(request);
		if (!result.ok) {
			throw result.error;
		}

		return result.value;
	}

	/**
	 * Example 3: Test with syntax error
	 */
	async runTestWithSyntaxError(): Promise<TestExecutionResponse> {
		const testCode = `
import { describe, test, expect } from 'vitest';

describe('Calculator', () => {
  test('should add two numbers', () => {
    const result = 2 + 2;
    expect(result).toBe(4)  // Missing semicolon
  });
});`;

		const request: TestExecutionRequest = {
			testCode,
			fileName: "calculator-syntax-error.test.ts",
		};

		const result = await this.engine.executeTest(request);
		if (!result.ok) {
			throw result.error;
		}

		return result.value;
	}

	/**
	 * Example 4: Test with runtime error
	 */
	async runTestWithRuntimeError(): Promise<TestExecutionResponse> {
		const testCode = `
import { describe, test, expect } from 'vitest';

describe('Calculator', () => {
  test('should handle null values', () => {
    const obj = null;
    expect(obj.value).toBe(undefined); // Will throw TypeError
  });
});`;

		const request: TestExecutionRequest = {
			testCode,
			fileName: "calculator-runtime-error.test.ts",
		};

		const result = await this.engine.executeTest(request);
		if (!result.ok) {
			throw result.error;
		}

		return result.value;
	}

	/**
	 * Example 5: Test importing actual project functions
	 */
	async runTestWithProjectImport(): Promise<TestExecutionResponse> {
		const testCode = `
import { describe, test, expect } from 'vitest';
import { add, multiply } from '../example/calculator';

describe('Calculator Functions', () => {
  test('should add two numbers correctly', () => {
    const result = add(5, 3);
    expect(result).toBe(8);
  });

  test('should multiply two numbers correctly', () => {
    const result = multiply(4, 6);
    expect(result).toBe(24);
  });

  test('should handle edge cases', () => {
    expect(add(0, 0)).toBe(0);
    expect(multiply(1, 0)).toBe(0);
    expect(add(-5, 5)).toBe(0);
  });
});`;

		const request: TestExecutionRequest = {
			testCode,
			fileName: "calculator-project-import.test.ts",
			context: {
				functionUnderTest: "add, multiply",
				imports: ["../example/calculator"],
			},
		};

		const result = await this.engine.executeTest(request);
		if (!result.ok) {
			throw result.error;
		}

		return result.value;
	}

	/**
	 * Run all examples and return a summary
	 */
	async runAllExamples(): Promise<ExampleResults> {
		const results: ExampleResults = {
			examples: [],
			summary: {
				total: 0,
				successful: 0,
				withAutoFixes: 0,
				failed: 0,
			},
		};

		const examples = [
			{ name: "Simple Passing Test", method: this.runSimplePassingTest.bind(this) },
			{ name: "Missing Import Test", method: this.runTestWithMissingImport.bind(this) },
			{ name: "Syntax Error Test", method: this.runTestWithSyntaxError.bind(this) },
			{ name: "Runtime Error Test", method: this.runTestWithRuntimeError.bind(this) },
			{ name: "Project Import Test", method: this.runTestWithProjectImport.bind(this) },
		];

		for (const example of examples) {
			try {
				console.log(`Running: ${example.name}...`);
				const result = await example.method();
				const metrics = this.engine.getExecutionMetrics(result);

				results.examples.push({
					name: example.name,
					success: result.success,
					metrics,
					response: result,
				});

				results.summary.total++;
				if (result.success) {
					results.summary.successful++;
				} else {
					results.summary.failed++;
				}

				if (metrics.autoFixesApplied > 0) {
					results.summary.withAutoFixes++;
				}

				console.log(`✓ ${example.name}: ${result.success ? 'PASSED' : 'FAILED'} (${metrics.totalIterations} iterations, ${metrics.autoFixesApplied} auto-fixes)`);
			} catch (error) {
				console.error(`✗ ${example.name}: ERROR -`, error);
				results.examples.push({
					name: example.name,
					success: false,
					error: error instanceof Error ? error.message : String(error),
				});
				results.summary.total++;
				results.summary.failed++;
			}
		}

		return results;
	}
}

export interface ExampleResults {
	readonly examples: readonly ExampleResult[];
	readonly summary: {
		readonly total: number;
		readonly successful: number;
		readonly withAutoFixes: number;
		readonly failed: number;
	};
}

export interface ExampleResult {
	readonly name: string;
	readonly success: boolean;
	readonly metrics?: import("../core/execution").ExecutionMetrics;
	readonly response?: TestExecutionResponse;
	readonly error?: string;
}

// Demo function to run the examples
export async function runExecutionDemo(): Promise<void> {
	console.log("🚀 TestPilot AST Execution Engine Demo\n");

	const example = new TestExecutionExample();
	const results = await example.runAllExamples();

	console.log("\n📊 Summary:");
	console.log(`Total examples: ${results.summary.total}`);
	console.log(`Successful: ${results.summary.successful}`);
	console.log(`With auto-fixes: ${results.summary.withAutoFixes}`);
	console.log(`Failed: ${results.summary.failed}`);

	console.log("\n🔍 Detailed Results:");
	for (const result of results.examples) {
		if (result.metrics) {
			console.log(`
${result.name}:
  Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}
  Iterations: ${result.metrics.totalIterations}
  Execution Time: ${result.metrics.totalExecutionTime}ms
  Auto-fixes Applied: ${result.metrics.autoFixesApplied}
  Error Types: ${result.metrics.uniqueErrorTypes.join(', ') || 'None'}
			`);
		} else {
			console.log(`
${result.name}:
  Status: ❌ ERROR
  Error: ${result.error}
			`);
		}
	}
}