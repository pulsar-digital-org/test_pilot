export interface ParameterInfo {
	name: string;
	type: string | undefined;
	optional: boolean;
	defaultValue: string | undefined;
}

export interface FunctionInfo {
	name: string;
	filePath: string;
	implementation: string;
	startLine: number;
	startColumn: number;
	parameters: readonly ParameterInfo[];
	returnType: string | undefined;
	isAsync: boolean;
	jsDoc?: string | undefined;
	classContext?: ClassInfo;
}

export interface ClassPropertyInfo {
	name: string;
	type: string | undefined;
	isPrivate: boolean;
	isStatic: boolean;
	isReadonly: boolean;
}

export interface ClassMethodInfo {
	name: string;
	parameters: readonly ParameterInfo[];
	returnType: string | undefined;
	isAsync: boolean;
	isPrivate: boolean;
	isStatic: boolean;
	jsDoc?: string | undefined;
}

export interface ClassInfo {
	name: string;
	properties: readonly ClassPropertyInfo[];
	methods: readonly ClassMethodInfo[];
	jsDoc?: string | undefined;
}

export interface ParsedFile<T = unknown> {
	filePath: string;
	language: string;
	ast: T;
	metadata?: Record<string, unknown>;
}

export interface DiscoveryOptions {
	includePatterns?: string[];
	excludePatterns?: string[];
	includePrivateMethods?: boolean;
	includeAnonymousFunctions?: boolean;
	includeArrowFunctions?: boolean;
	includeClassMethods?: boolean;
}

export interface AnalysisOptions {
	withDependencies?: boolean;
	withUsageAnalysis?: boolean;
	withTypeInference?: boolean;
	maxDepth?: number;
}
