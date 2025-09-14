import ts from "typescript";
import { TypeScriptParser } from "../discovery/typescript/parser";
import type {
	ExecutionContext,
	ExecutionResult,
	ExecutionError,
	ExecutionErrorType,
	IASTExecutor,
	ImportResolution,
	ImportSymbol,
	ExecutionOptions,
} from "./types";
import type { Result } from "../../types/misc";

const DEFAULT_EXECUTION_OPTIONS: Required<ExecutionOptions> = {
	timeout: 5000,
	mockExternalDependencies: true,
	captureConsole: true,
	isolateGlobals: true,
};

export class ASTExecutor implements IASTExecutor {
	private readonly parser: TypeScriptParser;
	private readonly executionOptions: Required<ExecutionOptions>;

	constructor(options: ExecutionOptions = {}) {
		this.parser = new TypeScriptParser();
		this.executionOptions = { ...DEFAULT_EXECUTION_OPTIONS, ...options };
	}

	async execute(context: ExecutionContext): Promise<Result<ExecutionResult>> {
		const startTime = Date.now();

		try {
			// 1. Validate syntax first
			const syntaxResult = await this.validateSyntax(context.sourceCode);
			if (!syntaxResult.ok) {
				return {
					ok: false,
					error: new Error(`Syntax validation failed: ${syntaxResult.error.message}`),
				};
			}

			// 2. Parse the code into AST
			const parseResult = this.parser.parseContent(context.sourceCode, context.fileName);
			if (!parseResult.ok) {
				return this.createExecutionError(
					"syntax_error",
					parseResult.error.message,
					startTime,
				);
			}

			// 3. Resolve imports
			const importResult = await this.resolveImports(
				context.sourceCode,
				context.fileName,
			);
			if (!importResult.ok) {
				return this.createExecutionError(
					"import_error",
					importResult.error.message,
					startTime,
				);
			}

			// 4. Create execution environment
			const environment = this.createExecutionEnvironment(
				parseResult.value,
				importResult.value,
				context.globalMocks,
			);

			// 5. Execute the code
			const executionResult = await this.executeInEnvironment(
				environment,
				context.sourceCode,
				startTime,
			);

			return { ok: true, value: executionResult };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	async validateSyntax(code: string): Promise<Result<boolean>> {
		try {
			const parseResult = this.parser.parseContent(code, "temp-validation.ts");
			if (!parseResult.ok) {
				return { ok: false, error: parseResult.error };
			}

			// Simple syntax validation - if parsing succeeded, syntax is valid
			return { ok: true, value: true };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	async resolveImports(
		code: string,
		basePath: string,
	): Promise<Result<ImportResolution[]>> {
		try {
			const parseResult = this.parser.parseContent(code);
			if (!parseResult.ok) {
				return { ok: false, error: parseResult.error };
			}

			const sourceFile = parseResult.value.ast;
			const imports: ImportResolution[] = [];

			const visitNode = (node: ts.Node): void => {
				if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
					const specifier = node.moduleSpecifier.text;
					const symbols: ImportSymbol[] = [];

					if (node.importClause) {
						// Default import
						if (node.importClause.name) {
							symbols.push({
								name: "default",
								alias: node.importClause.name.text,
								type: "default",
							});
						}

						// Named imports
						if (node.importClause.namedBindings) {
							if (ts.isNamespaceImport(node.importClause.namedBindings)) {
								symbols.push({
									name: "*",
									alias: node.importClause.namedBindings.name.text,
									type: "namespace",
								});
							} else if (ts.isNamedImports(node.importClause.namedBindings)) {
								for (const element of node.importClause.namedBindings.elements) {
									symbols.push({
										name: element.name.text,
										alias: element.propertyName?.text,
										type: "named",
									});
								}
							}
						}
					}

					imports.push({
						specifier,
						symbols,
						// TODO: Implement actual path resolution
						resolvedPath: this.resolveModulePath(specifier, basePath),
					});
				}

				ts.forEachChild(node, visitNode);
			};

			visitNode(sourceFile);
			return { ok: true, value: imports };
		} catch (error) {
			return {
				ok: false,
				error: error instanceof Error ? error : new Error(String(error)),
			};
		}
	}

	private resolveModulePath(specifier: string, _basePath: string): string | undefined {
		// Simple resolution logic - in production this would be more sophisticated
		if (specifier.startsWith(".")) {
			// Relative import - would need proper path resolution
			return undefined;
		}

		// External dependency - would normally resolve from node_modules
		return undefined;
	}

	private createExecutionEnvironment(
		parsedFile: any,
		imports: ImportResolution[],
		globalMocks?: Record<string, unknown>,
	): ExecutionEnvironment {
		const mockModules = new Map<string, unknown>();

		// Create mock implementations for imports
		for (const importResolution of imports) {
			if (this.executionOptions.mockExternalDependencies) {
				mockModules.set(
					importResolution.specifier,
					this.createMockModule(importResolution),
				);
			}
		}

		return {
			parsedFile,
			mockModules,
			globals: globalMocks || {},
			console: this.executionOptions.captureConsole ? this.createMockConsole() : console,
		};
	}

	private createMockModule(importResolution: ImportResolution): unknown {
		const mockModule: Record<string, unknown> = {};

		for (const symbol of importResolution.symbols) {
			switch (symbol.type) {
				case "default":
					mockModule.default = this.createMockFunction(symbol.name);
					break;
				case "named":
					mockModule[symbol.name] = this.createMockFunction(symbol.name);
					break;
				case "namespace":
					// Return the entire mock module for namespace imports
					return mockModule;
			}
		}

		return mockModule;
	}

	private createMockFunction(name: string): unknown {
		return jest?.fn?.() || (() => `mock_${name}_result`);
	}

	private createMockConsole(): Console & { getLogs?: () => string[]; getErrors?: () => string[] } {
		const logs: string[] = [];
		const errors: string[] = [];

		return {
			...console,
			log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
			error: (...args: unknown[]) => errors.push(args.map(String).join(" ")),
			warn: (...args: unknown[]) => logs.push(`WARN: ${args.map(String).join(" ")}`),
			info: (...args: unknown[]) => logs.push(`INFO: ${args.map(String).join(" ")}`),
			getLogs: () => logs,
			getErrors: () => errors,
		};
	}

	private async executeInEnvironment(
		environment: ExecutionEnvironment,
		sourceCode: string,
		startTime: number,
	): Promise<ExecutionResult> {
		try {
			// Transform TypeScript to JavaScript
			const jsCode = this.transpileToJavaScript(sourceCode);

			// Create isolated execution context
			const context = this.createIsolatedContext(environment);

			// Execute with timeout
			const result = await this.executeWithTimeout(jsCode, context);

			return {
				success: true,
				output: result,
				stdout: environment.console.getLogs?.()?.join("\n"),
				stderr: environment.console.getErrors?.()?.join("\n"),
				executionTime: Date.now() - startTime,
			};
		} catch (error) {
			return this.createFailedExecutionResult(error, startTime);
		}
	}

	private transpileToJavaScript(sourceCode: string): string {
		const result = ts.transpile(sourceCode, {
			target: ts.ScriptTarget.ES2020,
			module: ts.ModuleKind.CommonJS,
			skipLibCheck: true,
		});

		return result;
	}

	private createIsolatedContext(environment: ExecutionEnvironment): Record<string, unknown> {
		const context: Record<string, unknown> = {
			console: environment.console,
			require: (moduleName: string) => {
				const mock = environment.mockModules.get(moduleName);
				if (mock) return mock;
				throw new Error(`Module '${moduleName}' not found in mock environment`);
			},
			...environment.globals,
		};

		// Add common globals if not isolated
		if (!this.executionOptions.isolateGlobals) {
			Object.assign(context, {
				setTimeout,
				setInterval,
				clearTimeout,
				clearInterval,
				Promise,
				Array,
				Object,
				JSON,
			});
		}

		return context;
	}

	private async executeWithTimeout(
		jsCode: string,
		context: Record<string, unknown>,
	): Promise<unknown> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				reject(new Error(`Execution timed out after ${this.executionOptions.timeout}ms`));
			}, this.executionOptions.timeout);

			try {
				// Use Function constructor for isolated execution
				const func = new Function(...Object.keys(context), `"use strict"; ${jsCode}`);
				const result = func(...Object.values(context));

				clearTimeout(timeout);
				resolve(result);
			} catch (error) {
				clearTimeout(timeout);
				reject(error);
			}
		});
	}

	private createExecutionError(
		type: ExecutionErrorType,
		message: string,
		startTime: number,
	): Result<ExecutionResult> {
		const error: ExecutionError = {
			type,
			message,
		};

		const result: ExecutionResult = {
			success: false,
			errors: [error],
			executionTime: Date.now() - startTime,
		};

		return { ok: true, value: result };
	}

	private createFailedExecutionResult(error: unknown, startTime: number): ExecutionResult {
		const executionError: ExecutionError = {
			type: "runtime_error",
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		};

		return {
			success: false,
			errors: [executionError],
			executionTime: Date.now() - startTime,
		};
	}
}

interface ExecutionEnvironment {
	parsedFile: unknown;
	mockModules: Map<string, unknown>;
	globals: Record<string, unknown>;
	console: Console & { getLogs?: () => string[]; getErrors?: () => string[] };
}