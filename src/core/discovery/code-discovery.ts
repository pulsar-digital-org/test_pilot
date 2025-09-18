import { DEFAULT_DISCOVERY_OPTIONS } from "./config";
import { DiscoveryError, ParseError } from "./errors";
import {
	FileSystemService,
	type IFileSystemService,
} from "./services/file-system";
import { ParserRegistry } from "./services/parser-registry";
import type { DiscoveryOptions, FunctionInfo } from "./types/core";

export class CodeDiscovery {
	private options: Required<DiscoveryOptions>;
	private fileSystem: IFileSystemService;
	private parserRegistry: ParserRegistry;

	constructor(
		private directoryPath: string,
		options: Partial<DiscoveryOptions> = {},
	) {
		this.options = { ...DEFAULT_DISCOVERY_OPTIONS, ...options };
		this.fileSystem = new FileSystemService();
		this.parserRegistry = new ParserRegistry(this.options);
	}

	/**
	 * Add patterns to include in discovery
	 */
	include(patterns: string | string[]): this {
		const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
		this.options.includePatterns.push(...patternsArray);
		return this;
	}

	/**
	 * Add patterns to exclude from discovery
	 */
	exclude(patterns: string | string[]): this {
		const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
		this.options.excludePatterns.push(...patternsArray);
		return this;
	}

	/**
	 * Enable/disable private method inclusion
	 */
	withPrivateMethods(include = true): this {
		this.options.includePrivateMethods = include;
		this.recreateParserRegistry();
		return this;
	}

	/**
	 * Enable/disable anonymous function inclusion
	 */
	withAnonymousFunctions(include = true): this {
		this.options.includeAnonymousFunctions = include;
		this.recreateParserRegistry();
		return this;
	}

	/**
	 * Enable/disable arrow function inclusion
	 */
	withArrowFunctions(include = true): this {
		this.options.includeArrowFunctions = include;
		this.recreateParserRegistry();
		return this;
	}

	/**
	 * Enable/disable class method inclusion
	 */
	withClassMethods(include = true): this {
		this.options.includeClassMethods = include;
		this.recreateParserRegistry();
		return this;
	}

	/**
	 * Find all functions in the configured directory/files
	 */
	async findFunctions(): Promise<readonly FunctionInfo[]> {
		try {
			const filePaths = await this.fileSystem.findFiles(
				this.directoryPath,
				this.options,
			);
			const allFunctions: FunctionInfo[] = [];

			for (const filePath of filePaths) {
				try {
					const parser = this.parserRegistry.getParser(filePath);
					const parsedFile = parser.parseFile(filePath);
					const functions = parser.extractFunctions(parsedFile);
					allFunctions.push(...functions);
				} catch (error) {
					if (error instanceof ParseError) {
						// Log parse errors but continue with other files
						console.warn(`Skipping file due to parse error: ${error.message}`);
						continue;
					}
					throw error;
				}
			}

			return allFunctions;
		} catch (error) {
			throw new DiscoveryError(
				`Failed to discover functions in ${this.directoryPath}`,
				error instanceof Error ? error : undefined,
			);
		}
	}

	/**
	 * Find a specific function by name
	 */
	async findFunction(functionName: string): Promise<FunctionInfo | undefined> {
		const functions = await this.findFunctions();
		return functions.find(
			(fn) => fn.name === functionName || fn.name.endsWith(`.${functionName}`), // Handle class methods
		);
	}

	/**
	 * Find functions matching specific patterns
	 */
	async findFunctionsByPatterns(
		patterns: string[],
	): Promise<readonly FunctionInfo[][]> {
		const results: FunctionInfo[][] = [];

		for (const pattern of patterns) {
			const tempDiscovery = new CodeDiscovery(this.directoryPath, {
				...this.options,
				includePatterns: [pattern],
			});
			const functions = await tempDiscovery.findFunctions();
			results.push([...functions]);
		}

		return results;
	}

	/**
	 * Get the list of files that would be processed
	 */
	async getFiles(): Promise<readonly string[]> {
		return this.fileSystem.findFiles(this.directoryPath, this.options);
	}

	/**
	 * Get supported file extensions
	 */
	getSupportedExtensions(): readonly string[] {
		return this.parserRegistry.getSupportedExtensions();
	}

	private recreateParserRegistry(): void {
		this.parserRegistry = new ParserRegistry(this.options);
	}
}
