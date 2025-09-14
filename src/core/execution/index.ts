export { ASTExecutor } from "./ast-executor";
export { ASTImportResolver } from "./import-resolver";
export { ErrorAnalyzer } from "./error-analyzer";
export { TestExecutionEngine } from "./test-execution-engine";

export type {
	ExecutionContext,
	ExecutionResult,
	ExecutionError,
	ExecutionErrorType,
	IASTExecutor,
	ExecutionOptions,
	ImportResolution,
	ImportSymbol,
} from "./types";

export type {
	ProjectImportResolver,
	ResolvedImport,
} from "./import-resolver";

export type {
	ErrorPattern,
	ErrorDetails,
	ErrorFixCategory,
	AnalyzedError,
	ErrorAnalysisResult,
	FixRecommendation,
} from "./error-analyzer";

export type {
	TestExecutionRequest,
	TestExecutionResponse,
	ExecutionIteration,
	TestIterationConfig,
	ExecutionMetrics,
} from "./test-execution-engine";