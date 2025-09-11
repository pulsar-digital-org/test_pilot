import type { CodeLocation } from "./misc";
import type { Result } from "./misc";

export interface Discovery {
    path: string;
    location: CodeLocation
}

export interface ParsedFile<T = unknown> {
    filePath: string;
    language: string;
    ast: T;
    metadata?: Record<string, unknown>;
}

export interface ParameterInfo {
    readonly name: string;
    readonly type: string | undefined;
    readonly optional: boolean;
    readonly defaultValue: string | undefined;
}

export interface FunctionInfo {
    readonly name: string;
    readonly filePath: string;
    readonly implementation: string;
    readonly parameters: readonly ParameterInfo[];
    readonly returnType: string | undefined;
    readonly isAsync: boolean;
    readonly jsDoc: string | undefined;
}

export abstract class AbstractParser {
    abstract parseFile(filePath: string): Result<ParsedFile>;
    abstract extractFunctions(parsedFile: ParsedFile): Result<readonly FunctionInfo[]>;
    abstract getSupportedExtensions(): readonly string[];
    abstract getName(): string;
}