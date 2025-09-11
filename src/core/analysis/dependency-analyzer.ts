import type { AbstractParser } from '../../types/discovery';
import type { Result } from '../../types/misc';
import type {
    DependencyAnalysisOptions,
    DependencyAnalysisResult,
    FunctionDependency,
    IFileSystem,
    IDependencyAnalyzer,
    IAnalysisParser,
    TypeReference
} from './types';

const DEFAULT_MAX_DEPTH = 3;

export class DependencyAnalyzer implements IDependencyAnalyzer {
    private readonly visitedFunctions = new Set<string>();
    private readonly circularDependencies = new Set<string>();
    private readonly cache = new Map<string, FunctionDependency>();

    constructor(
        private readonly parser: AbstractParser,
        private readonly analysisParser: IAnalysisParser,
        private readonly fileSystem: IFileSystem
    ) {}

    async analyzeDependencies(
        filePath: string,
        functionName: string,
        options: DependencyAnalysisOptions = {}
    ): Promise<Result<DependencyAnalysisResult>> {
        const finalOptions: Required<DependencyAnalysisOptions> = {
            maxDepth: DEFAULT_MAX_DEPTH,
            includeTypes: true,
            includeExternalDependencies: false,
            followImports: true,
            ...options
        };

        try {
            this.resetAnalysis();
            
            const rootDependency = await this.analyzeFunctionDependencies(
                filePath,
                functionName,
                0,
                finalOptions
            );

            if (!rootDependency.ok) {
                return rootDependency;
            }

            const result: DependencyAnalysisResult = {
                rootFunction: functionName,
                dependencies: { [functionName]: rootDependency.value },
                maxDepthReached: rootDependency.value.depth >= finalOptions.maxDepth,
                circularDependencies: Array.from(this.circularDependencies)
            };

            return { ok: true, value: result };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }

    private async analyzeFunctionDependencies(
        filePath: string,
        functionName: string,
        currentDepth: number,
        options: Required<DependencyAnalysisOptions>
    ): Promise<Result<FunctionDependency>> {
        const cacheKey = `${filePath}:${functionName}:${currentDepth}`;
        
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (cached) {
                return { ok: true, value: cached };
            }
        }

        if (currentDepth >= options.maxDepth) {
            return {
                ok: false,
                error: new Error(`Maximum depth ${options.maxDepth} reached`)
            };
        }

        const functionKey = `${filePath}:${functionName}`;
        if (this.visitedFunctions.has(functionKey)) {
            this.circularDependencies.add(functionKey);
            return {
                ok: false,
                error: new Error(`Circular dependency detected: ${functionKey}`)
            };
        }

        this.visitedFunctions.add(functionKey);

        try {
            const fileExists = await this.fileSystem.exists(filePath);
            if (!fileExists) {
                return {
                    ok: false,
                    error: new Error(`File not found: ${filePath}`)
                };
            }

            const content = await this.fileSystem.readFile(filePath);
            const parseResult = this.parser.parseFile(filePath, content);
            
            if (!parseResult.ok) {
                return parseResult;
            }

            const parsedFile = parseResult.value;
            
            // Extract function implementation
            const functionsResult = this.parser.extractFunctions(parsedFile);
            if (!functionsResult.ok) {
                return { ok: false, error: functionsResult.error };
            }

            const targetFunction = functionsResult.value.find(f => f.name === functionName);
            if (!targetFunction) {
                return {
                    ok: false,
                    error: new Error(`Function '${functionName}' not found in ${filePath}`)
                };
            }

            // Extract function calls
            const callsResult = this.analysisParser.extractFunctionCalls(parsedFile, functionName);
            const calls: Record<string, FunctionDependency> = {};
            
            if (callsResult.ok) {
                for (const call of callsResult.value) {
                    const callDependency = await this.resolveFunctionCall(
                        filePath,
                        call.name,
                        currentDepth + 1,
                        options,
                        parsedFile
                    );
                    
                    if (callDependency.ok) {
                        calls[call.name] = callDependency.value;
                    }
                }
            }

            // Extract type references
            const types: Record<string, TypeReference> = {};
            if (options.includeTypes) {
                const typesResult = this.analysisParser.extractTypeReferences(parsedFile, functionName);
                if (typesResult.ok) {
                    for (const typeRef of typesResult.value) {
                        types[typeRef.name] = typeRef;
                    }
                }
            }

            // Extract imports
            const importsResult = this.analysisParser.extractImports(parsedFile);
            const imports = importsResult.ok ? importsResult.value : [];

            const dependency: FunctionDependency = {
                name: functionName,
                implementation: targetFunction.signature,
                location: targetFunction.location,
                calls,
                types,
                imports,
                depth: currentDepth
            };

            this.cache.set(cacheKey, dependency);
            return { ok: true, value: dependency };

        } finally {
            this.visitedFunctions.delete(functionKey);
        }
    }

    private async resolveFunctionCall(
        currentFilePath: string,
        functionName: string,
        depth: number,
        options: Required<DependencyAnalysisOptions>,
        currentParsedFile: unknown
    ): Promise<Result<FunctionDependency>> {
        // First, check if function is in the same file
        const localResult = await this.analyzeFunctionDependencies(
            currentFilePath,
            functionName,
            depth,
            options
        );

        if (localResult.ok) {
            return localResult;
        }

        // If not found locally and we should follow imports
        if (options.followImports) {
            const importsResult = this.analysisParser.extractImports(currentParsedFile);
            if (importsResult.ok) {
                for (const importInfo of importsResult.value) {
                    if (importInfo.importedName === functionName || importInfo.aliasName === functionName) {
                        const resolvedPath = await this.resolveImportPath(currentFilePath, importInfo.modulePath);
                        if (resolvedPath) {
                            return this.analyzeFunctionDependencies(
                                resolvedPath,
                                importInfo.importedName,
                                depth,
                                options
                            );
                        }
                    }
                }
            }
        }

        // Return a stub dependency for unresolved functions
        return {
            ok: true,
            value: {
                name: functionName,
                implementation: '// External or unresolved function',
                location: { line: 0, column: 0 },
                calls: {},
                types: {},
                imports: [],
                depth
            }
        };
    }

    private async resolveImportPath(currentFilePath: string, importPath: string): Promise<string | null> {
        if (!importPath.startsWith('.')) {
            // External module - skip for now
            return null;
        }

        const resolved = this.fileSystem.resolvePath(currentFilePath, importPath);
        
        // Try common TypeScript extensions
        const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js'];
        
        for (const ext of extensions) {
            const fullPath = resolved + ext;
            const exists = await this.fileSystem.exists(fullPath);
            if (exists) {
                return fullPath;
            }
        }

        return null;
    }

    private resetAnalysis(): void {
        this.visitedFunctions.clear();
        this.circularDependencies.clear();
        this.cache.clear();
    }
}