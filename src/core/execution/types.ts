import type { Result } from "../../types/misc";

export interface ExecutionContext {
	readonly sourceCode: string;
	readonly fileName: string;
	readonly imports?: ImportResolution[];
	readonly globalMocks?: Record<string, unknown>;
}

export interface ImportResolution {
	readonly specifier: string;
	readonly resolvedPath?: string;
	readonly symbols: readonly ImportSymbol[];
}

export interface ImportSymbol {
	readonly name: string;
	readonly alias?: string;
	readonly type: "default" | "named" | "namespace";
}

export interface ExecutionResult {
	readonly success: boolean;
	readonly output?: unknown;
	readonly stdout?: string;
	readonly stderr?: string;
	readonly errors?: readonly ExecutionError[];
	readonly executionTime: number;
}

export interface ExecutionError {
	readonly type: ExecutionErrorType;
	readonly message: string;
	readonly line?: number;
	readonly column?: number;
	readonly stack?: string;
}

export type ExecutionErrorType =
	| "syntax_error"
	| "import_error"
	| "type_error"
	| "runtime_error"
	| "assertion_error"
	| "timeout_error";

export interface IASTExecutor {
	execute(context: ExecutionContext): Promise<Result<ExecutionResult>>;
	validateSyntax(code: string): Promise<Result<boolean>>;
	resolveImports(code: string, basePath: string): Promise<Result<ImportResolution[]>>;
}

export interface ExecutionOptions {
	readonly timeout?: number;
	readonly mockExternalDependencies?: boolean;
	readonly captureConsole?: boolean;
	readonly isolateGlobals?: boolean;
}