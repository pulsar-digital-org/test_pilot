import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, unlinkSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ExecutionResult, ExecutionError, ExecutionErrorType } from "./types";
import type { Result } from "../../types/misc";

export interface RealTestExecutionOptions {
	readonly timeout: number;
	readonly projectRoot: string;
	readonly testFramework?: "vitest" | "jest" | "auto";
	readonly cleanupTempFiles: boolean;
}

export interface TestFrameworkResult {
	readonly success: boolean;
	readonly testsRun: number;
	readonly testsPassed: number;
	readonly testsFailed: number;
	readonly executionTime: number;
	readonly output: string;
	readonly errors: readonly ParsedTestError[];
}

export interface ParsedTestError {
	readonly testName?: string;
	readonly errorMessage: string;
	readonly stack?: string;
	readonly line?: number;
	readonly type: "assertion" | "runtime" | "syntax" | "timeout";
}

const DEFAULT_OPTIONS: RealTestExecutionOptions = {
	timeout: 30000, // 30 seconds for real test execution
	projectRoot: process.cwd(),
	testFramework: "auto",
	cleanupTempFiles: true,
};

export class RealTestExecutor {
	private readonly options: RealTestExecutionOptions;

	constructor(options: Partial<RealTestExecutionOptions> = {}) {
		this.options = { ...DEFAULT_OPTIONS, ...options };
	}

	async executeTest(testCode: string, testFileName: string = "temp.test.ts"): Promise<Result<ExecutionResult>> {
		const startTime = Date.now();
		let tempFilePath: string | null = null;

		try {
			// 1. Fix relative import paths for temp directory structure
			const adjustedTestCode = this.adjustImportPaths(testCode);

			// 2. Create temporary test file
			tempFilePath = await this.createTempTestFile(adjustedTestCode, testFileName);

			// 3. Detect test framework
			const framework = this.detectTestFramework();

			// 4. Run the test
			const testResult = await this.runTest(tempFilePath, framework);

			// 5. Parse results into our standard format
			const executionResult = this.parseTestResults(testResult, startTime);

			return { ok: true, value: executionResult };

		} catch (error) {
			const executionResult: ExecutionResult = {
				success: false,
				errors: [{
					type: "runtime_error",
					message: error instanceof Error ? error.message : String(error),
				}],
				executionTime: Date.now() - startTime,
			};

			return { ok: true, value: executionResult };

		} finally {
			// 5. Cleanup
			if (tempFilePath && this.options.cleanupTempFiles) {
				try {
					const tempDir = dirname(tempFilePath);
					if (tempDir.includes(".testpilot-temp")) {
						rmSync(tempDir, { recursive: true, force: true });
					}
				} catch {
					// Ignore cleanup errors
				}
			}
		}
	}

	private async createTempTestFile(testCode: string, fileName: string): Promise<string> {
		// Create temp directory INSIDE the project so relative imports work
		const tempDir = join(this.options.projectRoot, ".testpilot-temp", `${Date.now()}-${Math.random().toString(36).substring(7)}`);
		mkdirSync(tempDir, { recursive: true });

		const tempFilePath = join(tempDir, fileName);
		writeFileSync(tempFilePath, testCode, "utf8");

		return tempFilePath;
	}

	private adjustImportPaths(testCode: string): string {
		// The temp directory structure is: /.testpilot-temp/random/test.ts
		// So relative imports like '../src/...' need to become '../../src/...'

		// Replace relative imports that start with '../' to add an extra '../'
		return testCode.replace(
			/import\s+{([^}]+)}\s+from\s+['"]\.\.\/([^'"]+)['"]/g,
			"import {$1} from '../../$2'"
		).replace(
			/import\s+([^{][^}]*)\s+from\s+['"]\.\.\/([^'"]+)['"]/g,
			"import $1 from '../../$2'"
		);
	}

	private detectTestFramework(): "vitest" | "jest" {
		if (this.options.testFramework !== "auto") {
			return this.options.testFramework;
		}

		// Try to detect from package.json
		try {
			const packageJsonPath = join(this.options.projectRoot, "package.json");
			if (existsSync(packageJsonPath)) {
				const packageJson = JSON.parse(require("fs").readFileSync(packageJsonPath, "utf8"));
				const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

				if (allDeps.vitest) return "vitest";
				if (allDeps.jest) return "jest";
			}
		} catch {
			// Ignore detection errors
		}

		// Default to vitest (more modern)
		return "vitest";
	}

	private async runTest(testFilePath: string, framework: "vitest" | "jest"): Promise<TestFrameworkResult> {
		return new Promise((resolve, reject) => {
			const startTime = Date.now();
			let command: string;
			let args: string[];

			// Set up command based on framework
			if (framework === "vitest") {
				command = "npx";
				args = ["vitest", "run", testFilePath, "--reporter=verbose", "--no-coverage"];
			} else {
				command = "npx";
				args = ["jest", testFilePath, "--verbose", "--no-coverage", "--passWithNoTests"];
			}

			let stdout = "";
			let stderr = "";

			const child = spawn(command, args, {
				cwd: this.options.projectRoot,
				stdio: "pipe",
				env: { ...process.env, NODE_ENV: "test" },
			});

			child.stdout?.on("data", (data) => {
				stdout += data.toString();
			});

			child.stderr?.on("data", (data) => {
				stderr += data.toString();
			});

			const timeout = setTimeout(() => {
				child.kill("SIGTERM");
				reject(new Error(`Test execution timed out after ${this.options.timeout}ms`));
			}, this.options.timeout);

			child.on("close", (code) => {
				clearTimeout(timeout);

				const executionTime = Date.now() - startTime;
				const output = stdout + stderr;

				// Parse the output based on framework
				const result = this.parseFrameworkOutput(output, framework, code === 0, executionTime);
				resolve(result);
			});

			child.on("error", (error) => {
				clearTimeout(timeout);
				reject(error);
			});
		});
	}

	private parseFrameworkOutput(
		output: string,
		framework: "vitest" | "jest",
		processSuccess: boolean,
		executionTime: number
	): TestFrameworkResult {
		const errors: ParsedTestError[] = [];
		let testsRun = 0;
		let testsPassed = 0;
		let testsFailed = 0;

		if (framework === "vitest") {
			// Parse Vitest output
			// Look for patterns like "✓ test-name (1ms)" or "✗ test-name"
			const testResults = output.match(/^[\s]*[✓❯×✗]\s+(.+?)(\s+\(\d+ms\))?$/gm) || [];
			testsRun = testResults.length;

			const passedTests = output.match(/^[\s]*✓\s+/gm) || [];
			testsPassed = passedTests.length;

			const failedTests = output.match(/^[\s]*[×✗❯]\s+/gm) || [];
			testsFailed = failedTests.length;

			// Parse error details
			const errorBlocks = output.split(/^[\s]*[×✗❯]\s+/gm);
			for (let i = 1; i < errorBlocks.length; i++) {
				const errorBlock = errorBlocks[i];
				const lines = errorBlock.split("\n");
				const testName = lines[0]?.trim();

				// Find error message
				const errorLine = lines.find(line => line.includes("Error:") || line.includes("AssertionError:"));
				const errorMessage = errorLine ? errorLine.trim() : "Test failed";

				errors.push({
					testName,
					errorMessage,
					type: this.categorizeError(errorMessage),
				});
			}

		} else {
			// Parse Jest output
			// Look for patterns like "✓ test-name" or "✗ test-name"
			const passedTests = output.match(/✓/g) || [];
			testsPassed = passedTests.length;

			const failedTests = output.match(/✕/g) || [];
			testsFailed = failedTests.length;

			testsRun = testsPassed + testsFailed;

			// Parse Jest errors (more complex parsing needed)
			if (output.includes("FAIL")) {
				const failSections = output.split("FAIL");
				for (let i = 1; i < failSections.length; i++) {
					const section = failSections[i];
					const errorMatch = section.match(/●\s+(.+?)\n\n\s+(.+?)(?=\n\s+at|$)/s);
					if (errorMatch) {
						errors.push({
							testName: errorMatch[1]?.trim(),
							errorMessage: errorMatch[2]?.trim() || "Test failed",
							type: this.categorizeError(errorMatch[2] || ""),
						});
					}
				}
			}
		}

		// Handle syntax errors or other failures
		if (!processSuccess && testsRun === 0) {
			if (output.includes("SyntaxError")) {
				errors.push({
					errorMessage: "Syntax error in test file",
					type: "syntax",
				});
			} else if (output.includes("Cannot find module")) {
				errors.push({
					errorMessage: "Import/module error",
					type: "runtime",
				});
			} else {
				errors.push({
					errorMessage: "Test execution failed",
					type: "runtime",
				});
			}
		}

		return {
			success: processSuccess && testsFailed === 0,
			testsRun,
			testsPassed,
			testsFailed,
			executionTime,
			output,
			errors,
		};
	}

	private categorizeError(errorMessage: string): ParsedTestError["type"] {
		const message = errorMessage.toLowerCase();

		if (message.includes("syntaxerror") || message.includes("unexpected token")) {
			return "syntax";
		}
		if (message.includes("timeout") || message.includes("timed out")) {
			return "timeout";
		}
		if (message.includes("expect") || message.includes("assertion") || message.includes("toBe") || message.includes("toEqual")) {
			return "assertion";
		}

		return "runtime";
	}

	private parseTestResults(testResult: TestFrameworkResult, startTime: number): ExecutionResult {
		const errors: ExecutionError[] = testResult.errors.map(error => ({
			type: this.mapErrorType(error.type),
			message: error.errorMessage,
			line: error.line,
		}));

		return {
			success: testResult.success,
			stdout: testResult.output,
			errors: errors.length > 0 ? errors : undefined,
			executionTime: Date.now() - startTime,
			output: {
				testsRun: testResult.testsRun,
				testsPassed: testResult.testsPassed,
				testsFailed: testResult.testsFailed,
			},
		};
	}

	private mapErrorType(errorType: ParsedTestError["type"]): ExecutionErrorType {
		switch (errorType) {
			case "assertion": return "assertion_error";
			case "syntax": return "syntax_error";
			case "timeout": return "timeout_error";
			case "runtime": return "runtime_error";
			default: return "runtime_error";
		}
	}
}