import type { CodeLocation } from "./misc";
import type { Result } from "./misc";

export interface Discovery {
    path: string;
    location: CodeLocation
}

export interface ParsedFile<T = unknown> {
    filePath: string;
    content: string;
    language: string;
    ast: T;
    metadata?: Record<string, unknown>;
}

export interface DiscoveryOptions {
    readonly includePrivate?: boolean;
    readonly includeNonExported?: boolean;
    readonly includeClassMethods?: boolean;
    readonly includeArrowFunctions?: boolean;
    readonly includeAnonymous?: boolean;
}

export interface ParameterInfo {
    name: string;
    type?: string;
    optional?: boolean;
    defaultValue?: string;
}

export interface FunctionInfo {
    name: string;
    signature: string;
    parameters: readonly ParameterInfo[];
    returnType?: string;
    isAsync?: boolean;
    isExported?: boolean;
    location: CodeLocation;
    jsDoc?: string;
}

export interface BaseRouteInfo {
    path: string;
    method: string;
    handler: string;
    location: CodeLocation;
}

export interface RouteInfo extends BaseRouteInfo {
    framework?: string;
    middleware?: string[];
    metadata?: Record<string, unknown>;
}

export abstract class AbstractParser {
    abstract parseFile(filePath: string, content: string): Result<ParsedFile>;
    abstract extractFunctions(parsedFile: ParsedFile, options?: DiscoveryOptions): Result<readonly FunctionInfo[]>;
    abstract extractRoutes(parsedFile: ParsedFile, options?: DiscoveryOptions): Result<readonly RouteInfo[]>;
    abstract getSupportedExtensions(): readonly string[];
    abstract getName(): string;
}