import type { FunctionInfo } from "../../types/discovery";
import type { ExecutionResult } from "../execution/types";
import type { Result } from "../../types/misc";

export interface GenerationState {
	readonly functionInfo: FunctionInfo;
	readonly systemPrompt: string;
	readonly userPrompt: string;
	readonly attempts: number;
	readonly maxAttempts: number;
	readonly generatedTest?: string;
	readonly executionResult?: ExecutionResult;
	readonly qualityScore?: QualityScore;
	readonly issues?: string[];
	readonly confidence?: number;
}

export interface QualityScore {
	readonly overall: number; // 0-100
	readonly coverage: number; // Edge cases coverage
	readonly correctness: number; // Syntax and logic correctness
	readonly completeness: number; // Test completeness
	readonly maintainability: number; // Code quality
	readonly feedback: string; // LLM feedback
}

export interface TestGenerationNode {
	readonly type: "generator" | "validator" | "executor" | "scorer" | "fixer";
	readonly name: string;
}

export interface GeneratorNode extends TestGenerationNode {
	readonly type: "generator";
	generate(state: GenerationState): Promise<Result<GeneratedTestResult>>;
}

export interface ValidatorNode extends TestGenerationNode {
	readonly type: "validator";
	validate(testCode: string): Promise<Result<ValidationResult>>;
}

export interface ExecutorNode extends TestGenerationNode {
	readonly type: "executor";
	execute(testCode: string, context: ExecutionContext): Promise<Result<ExecutionResult>>;
}

export interface ScorerNode extends TestGenerationNode {
	readonly type: "scorer";
	score(testCode: string, executionResult: ExecutionResult, functionInfo: FunctionInfo): Promise<Result<QualityScore>>;
}

export interface FixerNode extends TestGenerationNode {
	readonly type: "fixer";
	fix(testCode: string, issues: string[], functionInfo: FunctionInfo): Promise<Result<string>>;
}

export interface GeneratedTestResult {
	readonly code: string;
	readonly confidence: number;
	readonly metadata?: Record<string, unknown>;
}

export interface ValidationResult {
	readonly isValid: boolean;
	readonly issues: string[];
	readonly syntaxErrors?: string[];
	readonly importErrors?: string[];
}

export interface ExecutionContext {
	readonly functionPath: string;
	readonly functionName: string;
	readonly projectRoot: string;
}

export interface FlowResult {
	readonly success: boolean;
	readonly finalTest?: string;
	readonly qualityScore?: QualityScore;
	readonly attempts: number;
	readonly executionTime: number;
	readonly iterations: readonly FlowIteration[];
}

export interface FlowIteration {
	readonly attempt: number;
	readonly generatedCode?: string;
	readonly validationResult?: ValidationResult;
	readonly executionResult?: ExecutionResult;
	readonly qualityScore?: QualityScore;
	readonly appliedFixes?: string[];
	readonly timestamp: number;
}