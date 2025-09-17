import type { FunctionInfo } from "../discovery/types/core";

/**
 * Represents a function call found in code
 */
export interface FunctionCall {
	name: string;
	line: number;
	column: number;
	type: "function" | "method" | "constructor" | "static";
	receiver?: string; // For method calls, what object/class it's called on
}

/**
 * Information about external/internal functions not discovered in the codebase
 */
export interface InternalFunctionInfo {
	name: string;
	jsDoc: string;
	line: number; // Absolute line number in the file
	column: number; // Absolute column number in the file
	parents: FunctionInfo[]; // Functions that use this internal function
	lspDocumentation?: LSPDocumentation; // LSP documentation if available
}

/**
 * Analysis results for a function
 */
export interface FunctionAnalysis {
	parents: FunctionInfo[]; // Functions that call this function
	children: FunctionInfo[]; // Functions called by this function
	functions: InternalFunctionInfo[]; // External/internal functions used
}

/**
 * Extended FunctionInfo with optional analysis
 */
export interface EnhancedFunctionInfo extends FunctionInfo {
	analysis?: FunctionAnalysis;
}

/**
 * Configuration options for analysis
 */
export interface AnalysisConfig {
	includeParentsAndChildren?: boolean;
	includeInternalFunctions?: boolean;
	includeLSPDocumentation?: boolean;
	timeout?: number;
	maxDepth?: number;
}

/**
 * LSP documentation result
 */
export interface LSPDocumentation {
	signature?: string;
	documentation?: string;
	parameters?: Array<{
		name: string;
		documentation?: string;
	}>;
}

/**
 * LSP client options
 */
export interface LSPClientOptions {
	timeout?: number;
	maxIdleTime?: number;
	autoDispose?: boolean;
}

/**
 * LSP client statistics
 */
export interface LSPClientStats {
	isConnected: boolean;
	openDocuments: number;
	idleTime: number;
}