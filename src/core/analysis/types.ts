import type { CodeLocation, Result } from '../../types/misc';

export interface DependencyAnalysisOptions {
    readonly maxDepth?: number;
    readonly includeTypes?: boolean;
    readonly includeExternalDependencies?: boolean;
    readonly followImports?: boolean;
}

export interface FunctionCall {
    name: string;
    location: CodeLocation;
    arguments: readonly string[];
}

export interface TypeReference {
    name: string;
    location: CodeLocation;
    definition?: string;
    properties?: readonly TypeProperty[];
}

export interface TypeProperty {
    name: string;
    type: string;
    optional?: boolean;
}

export interface ImportInfo {
    modulePath: string;
    importedName: string;
    aliasName?: string;
    isDefault?: boolean;
    location: CodeLocation;
}

export interface FunctionDependency {
    name: string;
    implementation: string;
    location: CodeLocation;
    calls: Record<string, FunctionDependency>;
    types: Record<string, TypeReference>;
    imports: readonly ImportInfo[];
    depth: number;
}

export interface DependencyAnalysisResult {
    rootFunction: string;
    dependencies: Record<string, FunctionDependency>;
    maxDepthReached: boolean;
    circularDependencies: readonly string[];
}

export interface IFileSystem {
    readFile(path: string): Promise<string>;
    exists(path: string): Promise<boolean>;
    resolvePath(basePath: string, relativePath: string): string;
}

export interface IAnalysisParser {
    extractFunctionCalls(parsedFile: unknown, functionName: string): Result<readonly FunctionCall[]>;
    extractTypeReferences(parsedFile: unknown, functionName: string): Result<readonly TypeReference[]>;
    extractImports(parsedFile: unknown): Result<readonly ImportInfo[]>;
}

export interface IDependencyAnalyzer {
    analyzeDependencies(
        filePath: string,
        functionName: string,
        options?: DependencyAnalysisOptions
    ): Promise<Result<DependencyAnalysisResult>>;
}