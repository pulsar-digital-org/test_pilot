import type { ExecutionError, ExecutionErrorType } from "./types";
import type { Result } from "../../types/misc";

export interface ErrorPattern {
	readonly type: ExecutionErrorType;
	readonly pattern: RegExp;
	readonly extractDetails?: (match: RegExpMatchArray) => ErrorDetails;
}

export interface ErrorDetails {
	readonly line?: number;
	readonly column?: number;
	readonly suggestion?: string;
	readonly fixCategory?: ErrorFixCategory;
}

export type ErrorFixCategory =
	| "missing_import"
	| "incorrect_import_path"
	| "missing_dependency"
	| "syntax_error"
	| "type_mismatch"
	| "undefined_variable"
	| "assertion_failure"
	| "timeout";

export interface AnalyzedError extends ExecutionError {
	readonly category?: ErrorFixCategory;
	readonly suggestion?: string;
	readonly confidence: number; // 0-1 scale
}

export interface ErrorAnalysisResult {
	readonly originalErrors: readonly ExecutionError[];
	readonly analyzedErrors: readonly AnalyzedError[];
	readonly primaryError?: AnalyzedError;
	readonly fixSuggestions: readonly string[];
}

export class ErrorAnalyzer {
	private readonly errorPatterns: readonly ErrorPattern[] = [
		// Import/Module Errors
		{
			type: "import_error",
			pattern: /Cannot resolve module '([^']+)' from '([^']+)'/,
			extractDetails: (match) => ({
				suggestion: `Check if module '${match[1]}' is installed or the import path is correct`,
				fixCategory: "missing_import",
			}),
		},
		{
			type: "import_error",
			pattern: /Module '([^']+)' not found/,
			extractDetails: (match) => ({
				suggestion: `Install missing dependency: npm install ${match[1]}`,
				fixCategory: "missing_dependency",
			}),
		},
		{
			type: "import_error",
			pattern: /Cannot find module '([^']+)'/,
			extractDetails: (match) => ({
				suggestion: `Check import path for '${match[1]}' - may need relative path adjustment`,
				fixCategory: "incorrect_import_path",
			}),
		},

		// Syntax Errors
		{
			type: "syntax_error",
			pattern: /Unexpected token '([^']+)' at line (\d+), column (\d+)/,
			extractDetails: (match) => ({
				line: parseInt(match[2], 10),
				column: parseInt(match[3], 10),
				suggestion: `Fix syntax error: unexpected '${match[1]}'`,
				fixCategory: "syntax_error",
			}),
		},
		{
			type: "syntax_error",
			pattern: /SyntaxError: (.+) \((\d+):(\d+)\)/,
			extractDetails: (match) => ({
				line: parseInt(match[2], 10),
				column: parseInt(match[3], 10),
				suggestion: `Fix syntax error: ${match[1]}`,
				fixCategory: "syntax_error",
			}),
		},

		// Type Errors
		{
			type: "type_error",
			pattern: /Property '([^']+)' does not exist on type '([^']+)'/,
			extractDetails: (match) => ({
				suggestion: `Property '${match[1]}' not found on '${match[2]}' - check spelling or type definition`,
				fixCategory: "type_mismatch",
			}),
		},
		{
			type: "type_error",
			pattern: /Argument of type '([^']+)' is not assignable to parameter of type '([^']+)'/,
			extractDetails: (match) => ({
				suggestion: `Type mismatch: expected '${match[2]}' but got '${match[1]}'`,
				fixCategory: "type_mismatch",
			}),
		},

		// Runtime Errors
		{
			type: "runtime_error",
			pattern: /ReferenceError: ([^\s]+) is not defined/,
			extractDetails: (match) => ({
				suggestion: `Variable '${match[1]}' is not defined - check if it's imported or declared`,
				fixCategory: "undefined_variable",
			}),
		},
		{
			type: "runtime_error",
			pattern: /TypeError: Cannot read propert(?:y|ies) '([^']+)' of (null|undefined)/,
			extractDetails: (match) => ({
				suggestion: `Property '${match[1]}' accessed on ${match[2]} - add null check`,
				fixCategory: "type_mismatch",
			}),
		},

		// Test Framework Errors
		{
			type: "assertion_error",
			pattern: /Expected (.+) to (.+)/,
			extractDetails: (match) => ({
				suggestion: `Assertion failed: ${match[1]} should ${match[2]}`,
				fixCategory: "assertion_failure",
			}),
		},
		{
			type: "assertion_error",
			pattern: /AssertionError: (.+)/,
			extractDetails: (match) => ({
				suggestion: `Test assertion failed: ${match[1]}`,
				fixCategory: "assertion_failure",
			}),
		},

		// Timeout Errors
		{
			type: "timeout_error",
			pattern: /Execution timed out after (\d+)ms/,
			extractDetails: (match) => ({
				suggestion: `Test execution exceeded ${match[1]}ms - optimize or increase timeout`,
				fixCategory: "timeout",
			}),
		},
	];

	analyzeErrors(errors: readonly ExecutionError[]): Result<ErrorAnalysisResult> {
		try {
			const analyzedErrors: AnalyzedError[] = [];

			for (const error of errors) {
				const analyzed = this.analyzeError(error);
				analyzedErrors.push(analyzed);
			}

			// Find primary error (highest confidence, most actionable)
			const primaryError = this.findPrimaryError(analyzedErrors);

			// Generate fix suggestions
			const fixSuggestions = this.generateFixSuggestions(analyzedErrors);

			const result: ErrorAnalysisResult = {
				originalErrors: errors,
				analyzedErrors,
				primaryError,
				fixSuggestions,
			};

			return { ok: true, value: result };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private analyzeError(error: ExecutionError): AnalyzedError {
		let bestMatch: {
			pattern: ErrorPattern;
			details: ErrorDetails;
			confidence: number;
		} | null = null;

		// Try to match against known patterns
		for (const pattern of this.errorPatterns) {
			const match = error.message.match(pattern.pattern);
			if (match) {
				const details = pattern.extractDetails?.(match) || {};
				const confidence = this.calculateConfidence(pattern, match);

				if (!bestMatch || confidence > bestMatch.confidence) {
					bestMatch = { pattern, details, confidence };
				}
			}
		}

		// Create analyzed error
		const analyzed: AnalyzedError = {
			...error,
			category: bestMatch?.details.fixCategory,
			suggestion: bestMatch?.details.suggestion,
			confidence: bestMatch?.confidence || 0.1, // Low confidence for unknown errors
		};

		// Override line/column if pattern extracted them
		if (bestMatch?.details.line) {
			(analyzed as any).line = bestMatch.details.line;
		}
		if (bestMatch?.details.column) {
			(analyzed as any).column = bestMatch.details.column;
		}

		return analyzed;
	}

	private calculateConfidence(pattern: ErrorPattern, match: RegExpMatchArray): number {
		// Base confidence on pattern specificity and match quality
		let confidence = 0.7; // Base confidence for matched patterns

		// Boost confidence for patterns with extractDetails
		if (pattern.extractDetails) {
			confidence += 0.2;
		}

		// Boost confidence for patterns that match multiple groups
		if (match.length > 2) {
			confidence += 0.1;
		}

		// Ensure confidence is in 0-1 range
		return Math.min(confidence, 1.0);
	}

	private findPrimaryError(errors: readonly AnalyzedError[]): AnalyzedError | undefined {
		if (errors.length === 0) {
			return undefined;
		}

		// Priority order for error types
		const typePriority: Record<ExecutionErrorType, number> = {
			syntax_error: 10,
			import_error: 9,
			type_error: 8,
			runtime_error: 7,
			assertion_error: 6,
			timeout_error: 5,
		};

		// Find error with highest priority and confidence
		return errors.reduce((best, current) => {
			const bestPriority = typePriority[best.type] || 0;
			const currentPriority = typePriority[current.type] || 0;

			// Primary factor: error type priority
			if (currentPriority > bestPriority) {
				return current;
			}

			// Secondary factor: confidence (for same priority)
			if (currentPriority === bestPriority && current.confidence > best.confidence) {
				return current;
			}

			return best;
		});
	}

	private generateFixSuggestions(errors: readonly AnalyzedError[]): readonly string[] {
		const suggestions = new Set<string>();

		// Collect all unique suggestions
		for (const error of errors) {
			if (error.suggestion) {
				suggestions.add(error.suggestion);
			}

			// Add category-based generic suggestions
			if (error.category && !error.suggestion) {
				const generic = this.getGenericSuggestion(error.category);
				if (generic) {
					suggestions.add(generic);
				}
			}
		}

		// Add comprehensive suggestions based on error patterns
		if (this.hasErrorType(errors, "import_error")) {
			suggestions.add("Review all import statements and dependencies");
		}

		if (this.hasErrorType(errors, "type_error")) {
			suggestions.add("Run TypeScript compiler to check for type issues");
		}

		if (this.hasErrorType(errors, "syntax_error")) {
			suggestions.add("Use a linter to identify and fix syntax errors");
		}

		return Array.from(suggestions);
	}

	private hasErrorType(errors: readonly AnalyzedError[], type: ExecutionErrorType): boolean {
		return errors.some((error) => error.type === type);
	}

	private getGenericSuggestion(category: ErrorFixCategory): string | null {
		const suggestions: Record<ErrorFixCategory, string> = {
			missing_import: "Add the missing import statement",
			incorrect_import_path: "Verify and correct the import path",
			missing_dependency: "Install the required dependency",
			syntax_error: "Fix the syntax error in the code",
			type_mismatch: "Resolve the type mismatch",
			undefined_variable: "Define the variable or import it",
			assertion_failure: "Update the test assertion or fix the logic",
			timeout: "Optimize performance or increase timeout limit",
		};

		return suggestions[category] || null;
	}

	/**
	 * Get specific fix recommendations based on error analysis
	 */
	getFixRecommendations(analysis: ErrorAnalysisResult): readonly FixRecommendation[] {
		const recommendations: FixRecommendation[] = [];

		for (const error of analysis.analyzedErrors) {
			if (error.category && error.confidence > 0.5) {
				const recommendation = this.createFixRecommendation(error);
				if (recommendation) {
					recommendations.push(recommendation);
				}
			}
		}

		return recommendations;
	}

	private createFixRecommendation(error: AnalyzedError): FixRecommendation | null {
		switch (error.category) {
			case "missing_import":
				return {
					type: "add_import",
					description: error.suggestion || "Add missing import",
					confidence: error.confidence,
					automated: true,
				};

			case "incorrect_import_path":
				return {
					type: "fix_import_path",
					description: error.suggestion || "Fix import path",
					confidence: error.confidence,
					automated: true,
				};

			case "missing_dependency":
				return {
					type: "install_dependency",
					description: error.suggestion || "Install missing dependency",
					confidence: error.confidence,
					automated: false,
				};

			case "syntax_error":
				return {
					type: "fix_syntax",
					description: error.suggestion || "Fix syntax error",
					confidence: error.confidence,
					automated: false,
					location: error.line ? { line: error.line, column: error.column } : undefined,
				};

			default:
				return null;
		}
	}
}

export interface FixRecommendation {
	readonly type: "add_import" | "fix_import_path" | "install_dependency" | "fix_syntax" | "fix_logic";
	readonly description: string;
	readonly confidence: number;
	readonly automated: boolean;
	readonly location?: { line: number; column?: number };
}