// Main API exports
export { CodeDiscovery } from "./code-discovery";
// Configuration exports
export { DEFAULT_DISCOVERY_OPTIONS, SUPPORTED_EXTENSIONS } from "./config";

// Error exports
export {
	DiscoveryError,
	FunctionExtractionError,
	ParseError,
	UnsupportedFileTypeError,
} from "./errors";
// Type exports
export type {
	AnalysisOptions,
	ClassInfo,
	ClassMethodInfo,
	ClassPropertyInfo,
	DiscoveryOptions,
	FunctionInfo,
	ParameterInfo,
	ParsedFile,
} from "./types/core";

