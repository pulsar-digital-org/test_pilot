import { TypeScriptParser } from "../../discovery/typescript/parser";
import type { ValidatorNode, ValidationResult } from "../types";
import type { Result } from "../../../types/misc";

export class TestValidatorNode implements ValidatorNode {
	readonly type = "validator" as const;
	readonly name = "test-validator";

	private readonly parser = new TypeScriptParser();

	async validate(testCode: string): Promise<Result<ValidationResult>> {
		try {
			const issues: string[] = [];
			const syntaxErrors: string[] = [];
			const importErrors: string[] = [];

			// 1. Syntax validation
			const syntaxResult = await this.validateSyntax(testCode);
			if (!syntaxResult.ok) {
				syntaxErrors.push(syntaxResult.error.message);
				issues.push(`Syntax error: ${syntaxResult.error.message}`);
			}

			// 2. Import validation
			const importResult = await this.validateImports(testCode);
			if (!importResult.ok) {
				importErrors.push(importResult.error.message);
				issues.push(`Import error: ${importResult.error.message}`);
			}

			// 3. Test structure validation
			const structureResult = this.validateTestStructure(testCode);
			if (!structureResult.ok) {
				issues.push(`Structure error: ${structureResult.error.message}`);
			}

			// 4. Test framework validation
			const frameworkResult = this.validateTestFramework(testCode);
			if (!frameworkResult.ok) {
				issues.push(`Framework error: ${frameworkResult.error.message}`);
			}

			// 5. Basic completeness checks
			const completenessResult = this.validateCompleteness(testCode);
			if (!completenessResult.ok) {
				issues.push(`Completeness error: ${completenessResult.error.message}`);
			}

			const result: ValidationResult = {
				isValid: issues.length === 0,
				issues,
				syntaxErrors: syntaxErrors.length > 0 ? syntaxErrors : undefined,
				importErrors: importErrors.length > 0 ? importErrors : undefined,
			};

			return { ok: true, value: result };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private async validateSyntax(code: string): Promise<Result<void>> {
		try {
			const parseResult = this.parser.parseContent(code, "temp-validation.ts");
			if (!parseResult.ok) {
				return { ok: false, error: parseResult.error };
			}
			return { ok: true, value: undefined };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private async validateImports(code: string): Promise<Result<void>> {
		const lines = code.split("\n");
		const importLines = lines.filter((line) => line.trim().startsWith("import"));

		for (const importLine of importLines) {
			// Check for common import issues
			if (!importLine.includes("from")) {
				return {
					ok: false,
					error: new Error(`Invalid import syntax: ${importLine.trim()}`),
				};
			}

			// Check for missing quotes
			if (!importLine.match(/from\s+['"][^'"]+['"]/)) {
				return {
					ok: false,
					error: new Error(`Import missing quotes: ${importLine.trim()}`),
				};
			}
		}

		// Check if test has testing framework imports
		const hasTestFramework =
			importLines.some((line) => line.includes("vitest")) ||
			importLines.some((line) => line.includes("jest")) ||
			importLines.some((line) => line.includes("mocha"));

		if (importLines.length > 0 && !hasTestFramework) {
			// Check if describe/test/expect are used without imports
			if (
				code.includes("describe(") ||
				code.includes("test(") ||
				code.includes("expect(")
			) {
				return {
					ok: false,
					error: new Error("Test uses testing functions but missing framework imports"),
				};
			}
		}

		return { ok: true, value: undefined };
	}

	private validateTestStructure(code: string): Result<void> {
		// Check for basic test structure
		if (!code.includes("describe(") && !code.includes("test(") && !code.includes("it(")) {
			return {
				ok: false,
				error: new Error("No test functions found (describe, test, or it)"),
			};
		}

		// Check for balanced braces
		const openBraces = (code.match(/{/g) || []).length;
		const closeBraces = (code.match(/}/g) || []).length;
		if (openBraces !== closeBraces) {
			return {
				ok: false,
				error: new Error(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`),
			};
		}

		// Check for balanced parentheses
		const openParens = (code.match(/\(/g) || []).length;
		const closeParens = (code.match(/\)/g) || []).length;
		if (openParens !== closeParens) {
			return {
				ok: false,
				error: new Error(`Unbalanced parentheses: ${openParens} open, ${closeParens} close`),
			};
		}

		return { ok: true, value: undefined };
	}

	private validateTestFramework(code: string): Result<void> {
		// Check if using expect without proper matcher
		const expectMatches = code.match(/expect\([^)]+\)\s*$/gm);
		if (expectMatches && expectMatches.length > 0) {
			return {
				ok: false,
				error: new Error("Found expect() calls without matchers (e.g., .toBe(), .toEqual())"),
			};
		}

		// Check for common async/await issues
		if (code.includes("async") && !code.includes("await")) {
			// This might be okay, but flag as potential issue
		}

		return { ok: true, value: undefined };
	}

	private validateCompleteness(code: string): Result<void> {
		// Check for at least one actual test case
		const testCases = (code.match(/(?:test|it)\s*\(/g) || []).length;
		if (testCases === 0) {
			return {
				ok: false,
				error: new Error("No test cases found"),
			};
		}

		// Check for at least one assertion
		const assertions = (code.match(/expect\s*\(/g) || []).length;
		if (assertions === 0) {
			return {
				ok: false,
				error: new Error("No assertions found"),
			};
		}

		// Warn if very few test cases (might be incomplete)
		if (testCases < 2) {
			// This is a warning, not an error
		}

		return { ok: true, value: undefined };
	}
}