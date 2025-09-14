import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import type { ImportResolution, ImportSymbol } from "./types";
import type { Result } from "../../types/misc";

export interface ProjectImportResolver {
	resolveImport(specifier: string, fromFile: string): Promise<Result<ResolvedImport>>;
	resolveAllImports(imports: ImportResolution[], fromFile: string): Promise<Result<ResolvedImport[]>>;
}

export interface ResolvedImport {
	readonly specifier: string;
	readonly resolvedPath: string;
	readonly isExternal: boolean;
	readonly symbols: readonly ImportSymbol[];
	readonly moduleExports?: Record<string, unknown>;
}

export class ASTImportResolver implements ProjectImportResolver {
	private readonly projectRoot: string;
	private readonly moduleCache = new Map<string, Record<string, unknown>>();

	constructor(projectRoot: string = process.cwd()) {
		this.projectRoot = projectRoot;
	}

	async resolveImport(specifier: string, fromFile: string): Promise<Result<ResolvedImport>> {
		try {
			const resolvedPath = await this.resolveModulePath(specifier, fromFile);
			if (!resolvedPath) {
				return {
					ok: false,
					error: new Error(`Cannot resolve module '${specifier}' from '${fromFile}'`),
				};
			}

			const isExternal = this.isExternalModule(specifier);
			const moduleExports = isExternal
				? await this.getExternalModuleExports(specifier)
				: await this.getLocalModuleExports(resolvedPath);

			const resolvedImport: ResolvedImport = {
				specifier,
				resolvedPath,
				isExternal,
				symbols: [], // Will be populated by caller based on import declaration
				moduleExports,
			};

			return { ok: true, value: resolvedImport };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	async resolveAllImports(
		imports: ImportResolution[],
		fromFile: string,
	): Promise<Result<ResolvedImport[]>> {
		try {
			const resolvedImports: ResolvedImport[] = [];

			for (const importRes of imports) {
				const result = await this.resolveImport(importRes.specifier, fromFile);
				if (!result.ok) {
					return { ok: false, error: result.error };
				}

				// Merge symbols from ImportResolution
				const resolvedImport: ResolvedImport = {
					...result.value,
					symbols: importRes.symbols,
				};

				resolvedImports.push(resolvedImport);
			}

			return { ok: true, value: resolvedImports };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private async resolveModulePath(specifier: string, fromFile: string): Promise<string | null> {
		// External module (node_modules)
		if (this.isExternalModule(specifier)) {
			return this.resolveExternalModule(specifier);
		}

		// Relative import
		if (specifier.startsWith(".")) {
			return this.resolveRelativeImport(specifier, fromFile);
		}

		// Absolute import with path mapping
		return this.resolveWithPathMapping(specifier);
	}

	private isExternalModule(specifier: string): boolean {
		return !specifier.startsWith(".") && !specifier.startsWith("/");
	}

	private resolveExternalModule(specifier: string): string | null {
		const nodeModulesPath = join(this.projectRoot, "node_modules", specifier);

		try {
			// Try to find package.json
			const packageJsonPath = join(nodeModulesPath, "package.json");
			if (existsSync(packageJsonPath)) {
				const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
				const mainFile = packageJson.main || packageJson.module || "index.js";
				return join(nodeModulesPath, mainFile);
			}

			// Fallback to index file
			for (const ext of [".js", ".ts", ".jsx", ".tsx"]) {
				const indexPath = join(nodeModulesPath, `index${ext}`);
				if (existsSync(indexPath)) {
					return indexPath;
				}
			}
		} catch (error) {
			// Module not found locally, will be mocked
		}

		return null;
	}

	private resolveRelativeImport(specifier: string, fromFile: string): string | null {
		const fromDir = dirname(fromFile);
		const possiblePaths = this.generatePossiblePaths(specifier, fromDir);

		for (const path of possiblePaths) {
			if (existsSync(path)) {
				return resolve(path);
			}
		}

		return null;
	}

	private generatePossiblePaths(specifier: string, fromDir: string): string[] {
		const basePath = resolve(fromDir, specifier);
		const paths: string[] = [];

		// Exact path
		paths.push(basePath);

		// With extensions
		for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
			paths.push(`${basePath}${ext}`);
		}

		// Index files
		for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
			paths.push(join(basePath, `index${ext}`));
		}

		return paths;
	}

	private resolveWithPathMapping(specifier: string): string | null {
		try {
			const tsConfigPath = join(this.projectRoot, "tsconfig.json");
			if (!existsSync(tsConfigPath)) {
				return null;
			}

			const tsConfig = JSON.parse(readFileSync(tsConfigPath, "utf8"));
			const paths = tsConfig.compilerOptions?.paths;
			const baseUrl = tsConfig.compilerOptions?.baseUrl || ".";

			if (!paths) {
				return null;
			}

			// Find matching path mapping
			for (const [pattern, mappings] of Object.entries(paths)) {
				if (typeof mappings !== "object" || !Array.isArray(mappings)) continue;

				const regex = new RegExp(
					"^" + pattern.replace(/\*/g, "(.*)") + "$",
				);
				const match = specifier.match(regex);

				if (match) {
					const [, ...groups] = match;

					for (const mapping of mappings) {
						let resolvedPath = mapping;

						// Replace wildcards
						groups.forEach((group, index) => {
							resolvedPath = resolvedPath.replace("*", group);
						});

						const fullPath = resolve(this.projectRoot, baseUrl, resolvedPath);
						const possiblePaths = this.generatePossiblePaths("", dirname(fullPath));

						for (const path of possiblePaths) {
							if (existsSync(path)) {
								return path;
							}
						}
					}
				}
			}

			return null;
		} catch (error) {
			return null;
		}
	}

	private async getExternalModuleExports(specifier: string): Promise<Record<string, unknown>> {
		// Check cache first
		const cached = this.moduleCache.get(specifier);
		if (cached) {
			return cached;
		}

		// For external modules, provide common mock exports
		const mockExports = this.createMockExports(specifier);
		this.moduleCache.set(specifier, mockExports);

		return mockExports;
	}

	private async getLocalModuleExports(filePath: string): Promise<Record<string, unknown>> {
		// Check cache first
		const cached = this.moduleCache.get(filePath);
		if (cached) {
			return cached;
		}

		try {
			// For local files, we could parse them to extract exports
			// For now, return empty object - in production this would analyze the file
			const exports: Record<string, unknown> = {};
			this.moduleCache.set(filePath, exports);

			return exports;
		} catch (error) {
			// Return empty object if we can't analyze the file
			return {};
		}
	}

	private createMockExports(specifier: string): Record<string, unknown> {
		// Create appropriate mocks based on common module patterns
		const mockExports: Record<string, unknown> = {};

		// Common testing libraries
		if (specifier === "vitest") {
			return {
				describe: jest?.describe || (() => {}),
				test: jest?.test || (() => {}),
				expect: jest?.expect || (() => ({ toBe: () => {}, toEqual: () => {} })),
				beforeEach: jest?.beforeEach || (() => {}),
				afterEach: jest?.afterEach || (() => {}),
				vi: {
					fn: jest?.fn || (() => () => {}),
					mock: jest?.mock || (() => {}),
				},
			};
		}

		if (specifier === "@jest/globals") {
			return {
				describe: jest?.describe || (() => {}),
				test: jest?.test || (() => {}),
				expect: jest?.expect || (() => ({ toBe: () => {}, toEqual: () => {} })),
				beforeEach: jest?.beforeEach || (() => {}),
				afterEach: jest?.afterEach || (() => {}),
				jest: jest || {
					fn: () => () => {},
					mock: () => {},
				},
			};
		}

		// Node.js built-ins
		if (specifier.startsWith("node:") || this.isNodeBuiltin(specifier)) {
			return this.createNodeBuiltinMock(specifier);
		}

		// Default mock
		mockExports.default = () => `mock_${specifier}_default`;

		return mockExports;
	}

	private isNodeBuiltin(specifier: string): boolean {
		const builtins = [
			"fs", "path", "os", "crypto", "util", "events", "stream",
			"http", "https", "url", "querystring", "buffer", "process"
		];

		return builtins.includes(specifier);
	}

	private createNodeBuiltinMock(specifier: string): Record<string, unknown> {
		const cleanSpecifier = specifier.replace("node:", "");

		switch (cleanSpecifier) {
			case "fs":
				return {
					readFileSync: () => "mock file content",
					writeFileSync: () => {},
					existsSync: () => true,
					promises: {
						readFile: async () => "mock file content",
						writeFile: async () => {},
					},
				};

			case "path":
				return {
					join: (...args: string[]) => args.join("/"),
					resolve: (...args: string[]) => args.join("/"),
					dirname: (path: string) => path.split("/").slice(0, -1).join("/"),
					basename: (path: string) => path.split("/").pop() || "",
				};

			default:
				return { default: () => `mock_${cleanSpecifier}` };
		}
	}
}