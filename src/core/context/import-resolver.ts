import { relative, dirname, join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export interface ImportInfo {
    readonly functionImport: string;  // How to import the function being tested
    readonly testingFramework: TestingFrameworkInfo;
}

export interface TestingFrameworkInfo {
    readonly name: 'vitest' | 'jest' | 'mocha' | 'unknown';
    readonly imports: {
        readonly describe: string;
        readonly test: string;
        readonly expect: string;
        readonly beforeEach?: string;
        readonly afterEach?: string;
        readonly mock?: string;
    };
}

export class ImportResolver {
    private readonly projectRoot: string;
    
    constructor(projectRoot: string = process.cwd()) {
        this.projectRoot = projectRoot;
    }

    /**
     * Resolve import information for a test file
     */
    resolveImports(
        functionFilePath: string, 
        functionName: string,
        testOutputPath: string
    ): ImportInfo {
        return {
            functionImport: this.resolveFunctionImport(functionFilePath, testOutputPath, functionName),
            testingFramework: this.detectTestingFramework()
        };
    }

    /**
     * Calculate the relative import path from test file to function file
     */
    private resolveFunctionImport(
        functionFilePath: string, 
        testOutputPath: string, 
        functionName: string
    ): string {
        // Calculate relative path from test file to function file
        const testDir = dirname(testOutputPath);
        const relativePath = relative(testDir, functionFilePath);
        
        // Remove file extension and ensure it starts with ./ or ../
        const importPath = relativePath.replace(/\.(ts|tsx|js|jsx)$/, '');
        const normalizedPath = importPath.startsWith('.') ? importPath : `./${importPath}`;
        
        // Return the import statement
        return `import { ${functionName} } from '${normalizedPath}';`;
    }

    /**
     * Detect the testing framework used in the project
     */
    private detectTestingFramework(): TestingFrameworkInfo {
        try {
            const packageJsonPath = join(this.projectRoot, 'package.json');
            
            if (!existsSync(packageJsonPath)) {
                return this.getUnknownFramework();
            }

            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
            const allDeps = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };

            // Check for Vitest first (preferred for modern projects)
            if (allDeps.vitest || allDeps['@vitest/ui']) {
                return {
                    name: 'vitest',
                    imports: {
                        describe: "import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';",
                        test: 'test',
                        expect: 'expect',
                        beforeEach: 'beforeEach',
                        afterEach: 'afterEach',
                        mock: 'vi'
                    }
                };
            }

            // Check for Jest
            if (allDeps.jest || allDeps['@types/jest']) {
                return {
                    name: 'jest',
                    imports: {
                        describe: "import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';",
                        test: 'test',
                        expect: 'expect',
                        beforeEach: 'beforeEach',
                        afterEach: 'afterEach',
                        mock: 'jest'
                    }
                };
            }

            // Check for Mocha
            if (allDeps.mocha || allDeps['@types/mocha']) {
                return {
                    name: 'mocha',
                    imports: {
                        describe: "import { describe, it } from 'mocha';\nimport { expect } from 'chai';",
                        test: 'it',
                        expect: 'expect',
                        beforeEach: 'beforeEach',
                        afterEach: 'afterEach'
                    }
                };
            }

            return this.getUnknownFramework();

        } catch (error) {
            return this.getUnknownFramework();
        }
    }

    private getUnknownFramework(): TestingFrameworkInfo {
        return {
            name: 'unknown',
            imports: {
                describe: "// Please add appropriate testing framework imports",
                test: 'test',
                expect: 'expect'
            }
        };
    }

    /**
     * Get the relative path from project root to file (for display purposes)
     */
    getRelativePathFromRoot(filePath: string): string {
        return relative(this.projectRoot, filePath);
    }

    /**
     * Check if the project uses TypeScript
     */
    isTypeScriptProject(): boolean {
        const tsConfigPath = join(this.projectRoot, 'tsconfig.json');
        return existsSync(tsConfigPath);
    }
}