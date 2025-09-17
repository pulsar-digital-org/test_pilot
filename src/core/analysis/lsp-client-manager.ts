import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	JSONRPCEndpoint,
	LspClient,
	type Hover,
	type Location,
	type LocationLink,
	type ResponseError,
} from "ts-lsp-client";
import type {
	LSPClientOptions,
	LSPClientStats,
	LSPDocumentation,
} from "./types";

/**
 * Manages a single LSP client connection for getting documentation
 * Simplified for single workspace usage
 */
export class LSPClientManager {
	private client: LspClient | null = null;
	private serverProcess: ChildProcess | null = null;
	private documentCache: Set<string> = new Set();
	private workspaceRoot: string | null = null;
	private options: Required<LSPClientOptions>;
	private idleTimer: NodeJS.Timeout | null = null;

	constructor(options: LSPClientOptions = {}) {
		this.options = {
			timeout: options.timeout ?? 5000,
			maxIdleTime: options.maxIdleTime ?? 300000, // 5 minutes
			autoDispose: options.autoDispose ?? true,
		};
	}

	/**
	 * Get documentation for function calls
	 * Returns a Map of function name to documentation
	 */
	async getDocumentation(
		filePath: string,
		functionCalls: Array<{ name: string; line: number; column?: number }>,
	): Promise<Map<string, LSPDocumentation>> {
		const results = new Map<string, LSPDocumentation>();
		const absolutePath = this.normalizePath(filePath);

		try {
			// Ensure LSP client is initialized
			await this.ensureClient(absolutePath);

			// Ensure document is opened in LSP
			await this.openDocument(absolutePath);

			// Request hover information for each function call
			for (const call of functionCalls) {
				try {
					const doc = await this.getHoverInfo(
						absolutePath,
						call.line,
						call.name,
						call.column,
					);
					results.set(call.name, doc);
				} catch (error) {
					console.warn(
						`Failed to get LSP documentation for ${call.name}:`,
						error,
					);
					// Fallback to basic documentation
					results.set(call.name, this.createFallbackDocumentation(call.name));
				}
			}
		} catch (error) {
			console.warn(`LSP client error for ${absolutePath}:`, error);
			// Return fallback documentation for all calls
			for (const call of functionCalls) {
				results.set(call.name, this.createFallbackDocumentation(call.name));
			}
		}

		return results;
	}

	/**
	 * Get statistics for the LSP client
	 */
	getStats(): LSPClientStats {
		return {
			isConnected: this.client !== null,
			openDocuments: this.documentCache.size,
			idleTime: 0, // Would track real idle time in production
		};
	}

	/**
	 * Dispose the LSP client connection
	 */
	async dispose(): Promise<void> {
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
			this.idleTimer = null;
		}

		if (this.client) {
			try {
				await this.client.shutdown();
				this.client.exit();
			} catch (error) {
				console.warn("Error disposing LSP client:", error);
			}
			this.client = null;
		}

		if (this.serverProcess) {
			try {
				this.serverProcess.kill();
			} catch (error) {
				console.warn("Error killing LSP server:", error);
			}
			this.serverProcess = null;
		}

		this.documentCache.clear();
		this.workspaceRoot = null;
	}

	/**
	 * Ensure LSP client is initialized for the workspace
	 */
	private async ensureClient(filePath: string): Promise<void> {
		const workspaceRoot = this.getWorkspaceRoot(filePath);

		// If client exists and workspace matches, just register activity
		if (this.client && this.workspaceRoot === workspaceRoot) {
			this.registerActivity();
			return;
		}

		// Dispose existing client if workspace changed
		if (this.client && this.workspaceRoot !== workspaceRoot) {
			await this.dispose();
		}

		// Create new client for this workspace
		this.workspaceRoot = workspaceRoot;
		this.serverProcess = this.startLanguageServer(workspaceRoot);

		const { stdin, stdout } = this.serverProcess;
		if (!stdin || !stdout) {
			throw new Error(
				"TypeScript Language Server stdio streams are not available",
			);
		}
		const endpoint = new JSONRPCEndpoint(stdin, stdout);
		this.client = new LspClient(endpoint);

		await this.initializeClient(this.client, workspaceRoot);
		this.registerActivity();
	}

	/**
	 * Start TypeScript Language Server as child process
	 */
	private startLanguageServer(workspaceRoot: string): ChildProcess {
		const serverProcess = spawn("typescript-language-server", ["--stdio"], {
			cwd: workspaceRoot,
			stdio: ["pipe", "pipe", "pipe"],
		});

		serverProcess.on("error", (error) => {
			console.error("TypeScript Language Server failed to start:", error);
		});

		return serverProcess;
	}

	/**
	 * Initialize LSP client with workspace
	 */
	private async initializeClient(
		client: LspClient,
		workspaceRoot: string,
	): Promise<void> {
		await client.initialize({
			processId: process.pid,
			rootUri: `file://${workspaceRoot}`,
			capabilities: {
				textDocument: {
					hover: { contentFormat: ["markdown", "plaintext"] },
					completion: { completionItem: { documentationFormat: ["markdown"] } },
				},
				workspace: {
					symbol: { symbolKind: { valueSet: [] } },
				},
			},
		});

		client.initialized();
	}

	/**
	 * Open document in LSP server
	 */
	private async openDocument(filePath: string): Promise<void> {
		if (this.documentCache.has(filePath)) {
			return; // Already opened
		}

		if (!this.client) {
			throw new Error("LSP client not initialized");
		}

		const content = readFileSync(filePath, "utf8");

		this.client.didOpen({
			textDocument: {
				uri: `file://${filePath}`,
				languageId: "typescript",
				version: 1,
				text: content,
			},
		});

		this.documentCache.add(filePath);
		this.registerActivity();
	}

	/**
	 * Get hover information for function at specific position
	 */
	private async getHoverInfo(
		filePath: string,
		line: number,
		functionName: string,
		column?: number,
	): Promise<LSPDocumentation> {
		if (!this.client) {
			throw new Error("LSP client not initialized");
		}

		// If no column provided, try to find the function name in the line
		let targetColumn = column;
		if (!targetColumn) {
			targetColumn = await this.findFunctionNameColumn(
				filePath,
				line,
				functionName,
			);
		}

		const hoverResult = await this.client.hover({
			textDocument: { uri: `file://${filePath}` },
			position: {
				line: Math.max(0, line - 1),
				character: Math.max(0, (targetColumn ?? 1) - 1),
			},
		});

		let parsed = hoverResult?.contents
			? this.parseHoverResult(hoverResult, functionName)
			: this.createFallbackDocumentation(functionName);

		if (this.needsDefinitionFallback(parsed.signature)) {
			const definitionDoc = await this.getDefinitionHover(
				filePath,
				line,
				targetColumn ?? 1,
				functionName,
			);
			if (definitionDoc) {
				parsed = definitionDoc;
			}
		}

		return parsed;
	}

	/**
	 * Parse LSP hover result into our documentation format
	 */
	private parseHoverResult(
		hoverResult: Hover,
		functionName: string,
	): LSPDocumentation {
		const contents = hoverResult.contents;
		let signature = "";
		const documentationParts: string[] = [];

		const addDocumentation = (value: string) => {
			const trimmed = value.trim();
			if (trimmed && !this.isSignatureLike(trimmed)) {
				// Clean up JSDoc-style comments
				const cleaned = this.cleanDocumentation(trimmed);
				if (cleaned) {
					documentationParts.push(cleaned);
				}
			}
		};

		const extractFromMarkdown = (text: string) => {
			// Handle markdown code blocks like ```typescript\ncode\n```
			const codeBlockRegex = /```(\w+)?\n([\s\S]*?)\n```/g;
			let match: RegExpExecArray | null;
			let foundCode = false;

			while (true) {
				match = codeBlockRegex.exec(text);
				if (!match) {
					break;
				}
				const [, language, code] = match;
				if (!code) {
					console.warn("This block has no code");
					continue;
				}
				if (language === "typescript" || language === "ts") {
					signature = this.cleanSignature(code.trim());
					foundCode = true;
				} else {
					addDocumentation(code.trim());
				}
			}

			// If no code blocks found, check if it's raw typescript code
			if (
				!foundCode &&
				((text.includes("(") && text.includes(")")) ||
					text.includes("class ") ||
					text.includes("function ") ||
					text.includes("constructor"))
			) {
				// Looks like a function/constructor signature without markdown formatting
				signature = this.cleanSignature(text.trim());
				foundCode = true;
			}

			// Add any remaining text as documentation
			const textWithoutCodeBlocks = text
				.replace(/```(\w+)?\n([\s\S]*?)\n```/g, "")
				.trim();
			if (textWithoutCodeBlocks) {
				addDocumentation(textWithoutCodeBlocks);
			}

			return foundCode;
		};

		const handleMarkedString = (
			value: string | { language: string; value: string },
		) => {
			if (typeof value === "string") {
				if (!extractFromMarkdown(value)) {
					addDocumentation(value);
				}
				return;
			}
			if (value.language === "typescript" || value.language === "ts") {
				signature = this.cleanSignature(value.value);
			} else {
				addDocumentation(value.value);
			}
		};

		if (Array.isArray(contents)) {
			for (const entry of contents) {
				handleMarkedString(entry);
			}
		} else if (typeof contents === "string") {
			handleMarkedString(contents);
		} else if (typeof contents === "object" && contents) {
			if ("language" in contents) {
				handleMarkedString(contents as { language: string; value: string });
			} else if ("value" in contents) {
				const valueContent = (contents as { value: string }).value;
				if (!extractFromMarkdown(valueContent)) {
					addDocumentation(valueContent);
				}
			}
		}

		return {
			signature: signature || `${functionName}(...args: any[]): any`,
			documentation:
				documentationParts.join("\n").trim() ||
				`Documentation for ${functionName}`,
			parameters: this.extractParameters(signature),
		};
	}

	private needsDefinitionFallback(signature?: string): boolean {
		if (!signature) {
			return true;
		}
		const trimmed = signature.trim();
		return trimmed.startsWith("import ") || trimmed.startsWith("export ");
	}

	private async getDefinitionHover(
		sourceFilePath: string,
		line: number,
		column: number,
		functionName: string,
	): Promise<LSPDocumentation | null> {
		if (!this.client) {
			return null;
		}

		const client = this.client;

		try {
			const position = {
				line: Math.max(0, line - 1),
				character: Math.max(0, column - 1),
			};
			const requests: Array<{
				label: string;
				fetch: () => Promise<
					Location | Location[] | LocationLink[] | ResponseError | null
				>;
			}> = [
				{
					label: "definition",
					fetch: () =>
						client.definition({
							textDocument: { uri: `file://${sourceFilePath}` },
							position,
						}),
				},
				{
					label: "typeDefinition",
					fetch: () =>
						client.typeDefinition({
							textDocument: { uri: `file://${sourceFilePath}` },
							position,
						}),
				},
				{
					label: "declaration",
					fetch: () =>
						client.gotoDeclaration({
							textDocument: { uri: `file://${sourceFilePath}` },
							position,
						}),
				},
			];

			for (const { label, fetch } of requests) {
				let locations: Array<{
					uri: string;
					range: { start: { line: number; character: number } };
				}> = [];
				try {
					const result = await fetch();
					locations = this.normalizeDefinitionLocations(result);
				} catch (error) {
					if ((error as { code?: number } | undefined)?.code !== -32601) {
						console.warn(
							`Definition request '${label}' failed for ${functionName}:`,
							error,
						);
					}
					continue;
				}

				for (const location of locations) {
				const targetPath = this.normalizePath(fileURLToPath(location.uri));
				await this.openDocument(targetPath);
				const hover = await this.client.hover({
					textDocument: { uri: `file://${targetPath}` },
					position: {
						line: Math.max(0, location.range.start.line),
						character: Math.max(0, location.range.start.character),
					},
				});
				if (!hover?.contents) {
					continue;
				}
				const parsed = this.parseHoverResult(hover, functionName);
				if (!this.needsDefinitionFallback(parsed.signature)) {
					return parsed;
				}
				}
			}
		} catch (error) {
			console.warn(
				`Definition lookup failed for ${functionName} at ${sourceFilePath}:${line}:${column}:`,
				error,
			);
		}

		return null;
	}

	private normalizeDefinitionLocations(
		result:
			| Location
			| Location[]
			| LocationLink[]
			| ResponseError
			| null
			| undefined,
	): Array<{ uri: string; range: { start: { line: number; character: number } } }> {
		if (!result) {
			return [];
		}

		if (this.isResponseError(result)) {
			return [];
		}

		const entries = Array.isArray(result) ? result : [result];
		const normalized: Array<{
			uri: string;
			range: { start: { line: number; character: number } };
		}> = [];

		for (const entry of entries) {
			if (!entry) continue;
			if (this.isLocationLink(entry)) {
				const range = entry.targetSelectionRange ?? entry.targetRange;
				if (!range) continue;
				normalized.push({
					uri: entry.targetUri,
					range: { start: { line: range.start.line, character: range.start.character } },
				});
			} else if (this.isLocation(entry)) {
				normalized.push({
					uri: entry.uri,
					range: {
						start: {
							line: entry.range.start.line,
							character: entry.range.start.character,
						},
					},
				});
			}
		}

		return normalized;
	}

	private isResponseError(value: unknown): value is ResponseError {
		return Boolean(
			value &&
			typeof value === "object" &&
			"code" in (value as Record<string, unknown>) &&
			"message" in (value as Record<string, unknown>),
		);
	}

	private isLocation(value: Location | LocationLink): value is Location {
		return "uri" in value;
	}

	private isLocationLink(value: Location | LocationLink): value is LocationLink {
		return "targetUri" in value;
	}

	/**
	 * Extract parameters from function signature
	 */
	private extractParameters(
		signature: string,
	): Array<{ name: string; documentation?: string }> {
		const paramList = this.getParameterSection(signature);
		if (!paramList?.trim()) {
			return [];
		}

		// Split parameters, handling nested types and generics
		const params = this.splitParameters(paramList)
			.map((p) => p.trim())
			.filter((p) => p)
			.map((p) => {
				const paramInfo = this.parseParameter(p);
				return {
					name: paramInfo.name,
					documentation:
						paramInfo.documentation ||
						`Parameter ${paramInfo.name}${paramInfo.type ? `: ${paramInfo.type}` : ""}`,
				};
			});

		return params;
	}

	private getParameterSection(signature: string): string | null {
		const cleanedSignature = this.removeDisplayMetadata(signature);
		let parenDepth = 0;
		let angleDepth = 0;
		let start = -1;

		for (let i = 0; i < cleanedSignature.length; i++) {
			const char = cleanedSignature[i];
			switch (char) {
				case "<":
					angleDepth++;
					break;
				case ">":
					if (angleDepth > 0) {
						angleDepth--;
					}
					break;
				case "(":
					if (angleDepth > 0) {
						break;
					}
					if (parenDepth === 0) {
						start = i + 1;
					}
					parenDepth++;
					break;
				case ")":
					if (parenDepth === 0) {
						break;
					}
					parenDepth--;
					if (parenDepth === 0 && start !== -1) {
						return cleanedSignature.slice(start, i);
					}
					break;
			}
		}

		return null;
	}

	/**
	 * Split parameter list handling nested types and generics
	 */
	private splitParameters(paramList: string): string[] {
		const params: string[] = [];
		let current = "";
		let depth = 0;
		let inString = false;
		let stringChar = "";

		for (let i = 0; i < paramList.length; i++) {
			const char = paramList[i];
			const prevChar = paramList[i - 1];

			// Handle string literals
			if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
				if (!inString) {
					inString = true;
					stringChar = char;
				} else if (char === stringChar) {
					inString = false;
					stringChar = "";
				}
			}

			if (!inString) {
				// Track nesting depth for generics and function types
				if (char === "<" || char === "(" || char === "{" || char === "[") {
					depth++;
				} else if (
					char === ">" ||
					char === ")" ||
					char === "}" ||
					char === "]"
				) {
					depth--;
				}

				// Split on comma only at top level
				if (char === "," && depth === 0) {
					params.push(current.trim());
					current = "";
					continue;
				}
			}

			current += char;
		}

		if (current.trim()) {
			params.push(current.trim());
		}

		return params;
	}

	/**
	 * Parse individual parameter to extract name and type
	 */
	private parseParameter(param: string): {
		name: string;
		type?: string;
		documentation?: string;
	} {
		// Handle destructured parameters
		if (param.startsWith("{") || param.startsWith("[")) {
			const colonIndex = param.indexOf(":");
			if (colonIndex > 0) {
				return {
					name: param.substring(0, colonIndex).trim(),
					type: param.substring(colonIndex + 1).trim(),
				};
			}
			return { name: param };
		}

		// Handle rest parameters
		if (param.startsWith("...")) {
			const withoutSpread = param.substring(3);
			const colonIndex = withoutSpread.indexOf(":");
			if (colonIndex > 0) {
				return {
					name: withoutSpread.substring(0, colonIndex).trim(),
					type: withoutSpread.substring(colonIndex + 1).trim(),
				};
			}
			return { name: withoutSpread };
		}

		// Handle optional parameters
		const isOptional = param.includes("?");
		const cleanParam = param.replace("?", "");

		// Split on colon to separate name and type
		const colonIndex = cleanParam.indexOf(":");
		if (colonIndex > 0) {
			const name = cleanParam.substring(0, colonIndex).trim();
			const type = cleanParam.substring(colonIndex + 1).trim();
			return {
				name,
				type: isOptional ? `${type} (optional)` : type,
			};
		}

		// Default case - just the parameter name
		const name = cleanParam.trim();
		const result: { name: string; type?: string; documentation?: string } = {
			name,
		};
		if (isOptional) {
			result.type = "any (optional)";
		}
		return result;
	}

	/**
	 * Create fallback documentation when LSP fails
	 */
	private createFallbackDocumentation(functionName: string): LSPDocumentation {
		return {
			signature: `${functionName}(...args: any[]): any`,
			documentation: `Function ${functionName} (LSP documentation unavailable)`,
			parameters: [{ name: "args", documentation: "Function arguments" }],
		};
	}

	private registerActivity(): void {
		if (!this.options.autoDispose) {
			return;
		}
		if (this.idleTimer) {
			clearTimeout(this.idleTimer);
		}
		this.idleTimer = setTimeout(() => {
			void this.dispose();
		}, this.options.maxIdleTime);
	}

	/**
	 * Get workspace root directory
	 */
	private getWorkspaceRoot(filePath: string): string {
		let currentDir = dirname(this.normalizePath(filePath));

		while (currentDir !== dirname(currentDir)) {
			const packageJson = join(currentDir, "package.json");
			const tsconfigJson = join(currentDir, "tsconfig.json");

			if (existsSync(packageJson) || existsSync(tsconfigJson)) {
				return currentDir;
			}

			currentDir = dirname(currentDir);
		}

		return dirname(this.normalizePath(filePath)); // Fallback
	}

	private normalizePath(filePath: string): string {
		return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
	}

	/**
	 * Clean and normalize function signatures
	 */
	private cleanSignature(signature: string): string {
		let cleaned = this.removeDisplayMetadata(signature).trim();

		// Handle import statements - extract the actual constructor signature
		if (cleaned.startsWith("import ")) {
			return cleaned;
		}

		// Collapse consecutive whitespace while keeping meaningful spacing
		cleaned = cleaned
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.join(" ")
			.replace(/\s+/g, " ");

		// Drop trailing import hints that may accompany alias signatures
		const importIndex = cleaned.indexOf(" import ");
		if (importIndex > 0) {
			const beforeImport = cleaned.slice(0, importIndex).trim();
			if (/(function|class|new|=>|\w+\s*\()/.test(beforeImport)) {
				cleaned = beforeImport;
			}
		}

		// Ensure proper formatting for constructors when metadata is still present
		if (cleaned.includes("new ") && !cleaned.startsWith("new ")) {
			const newMatch = cleaned.match(/new\s+(\w[\w\d$.<>\s,?:=&|\-[\]{}]*)/);
			if (newMatch?.[0]) {
				cleaned = newMatch[0].trim();
			}
		}

		return cleaned;
	}

	private removeDisplayMetadata(signature: string): string {
		let cleaned = signature.trim();
		const metadataPattern =
			/^\((?:alias|method|function|property|getter|setter|event|type|class|namespace|module|parameter)\)\s*/i;
		while (metadataPattern.test(cleaned)) {
			cleaned = cleaned.replace(metadataPattern, "");
		}
		return cleaned;
	}

	/**
	 * Check if a string looks like a function signature
	 */
	private isSignatureLike(text: string): boolean {
		const trimmed = text.trim();

		// Check for common signature patterns
		return (
			// Function/method signatures
			(trimmed.includes("(") && trimmed.includes(")")) ||
			// Class/constructor signatures
			trimmed.includes("class ") ||
			trimmed.includes("constructor") ||
			// Import statements
			trimmed.startsWith("import ") ||
			// Type definitions
			(trimmed.includes(": ") &&
				(trimmed.includes("=>") || trimmed.includes("function")))
		);
	}

	/**
	 * Clean documentation text
	 */
	private cleanDocumentation(text: string): string {
		let cleaned = text.trim();

		// Remove JSDoc comment markers
		cleaned = cleaned.replace(/^\/\*\*/, "").replace(/\*\/$/, "");
		cleaned = cleaned.replace(/^\s*\*\s?/gm, "");

		// Remove markdown code fences if they're not containing actual code
		if (!this.isSignatureLike(cleaned)) {
			cleaned = cleaned.replace(/^```[\w]*\n?/gm, "").replace(/\n?```$/gm, "");
		}

		// Clean up extra whitespace
		cleaned = cleaned.replace(/\n\s*\n/g, "\n").trim();

		// Remove common documentation prefixes
		cleaned = cleaned.replace(/^(Description|Summary):\s*/i, "");

		return cleaned;
	}

	/**
	 * Find the column position of a function name in a specific line
	 */
	private async findFunctionNameColumn(
		filePath: string,
		line: number,
		functionName: string,
	): Promise<number> {
		try {
			const content = readFileSync(filePath, "utf8");
			const lines = content.split("\n");
			const targetLine = lines[line - 1]; // Convert to 0-based indexing

			if (!targetLine) {
				return 1; // Fallback to beginning of line
			}

			// Look for function name patterns:
			// 1. Constructor calls: new FunctionName(
			// 2. Method calls: obj.functionName(
			// 3. Function calls: functionName(
			// 4. Import statements: import { functionName }

			const patterns = [
				new RegExp(`\\bnew\\s+(${functionName})\\s*\\(`, "g"),
				new RegExp(`\\.(${functionName})\\s*\\(`, "g"),
				new RegExp(`\\b(${functionName})\\s*\\(`, "g"),
				new RegExp(`\\b(${functionName})\\b`, "g"), // Fallback for any occurrence
			];

			for (const pattern of patterns) {
				const match = pattern.exec(targetLine);
				if (match) {
					// Return position of the function name, not the pattern start
					const functionNameIndex =
						match.index + match[0].indexOf(functionName);
					return functionNameIndex + 1; // Convert to 1-based indexing
				}
			}

			// If no pattern matches, look for any occurrence of the function name
			const simpleIndex = targetLine.indexOf(functionName);
			return simpleIndex >= 0 ? simpleIndex + 1 : 1;
		} catch (error) {
			console.warn(`Error finding function column for ${functionName}:`, error);
			return 1; // Fallback
		}
	}
}
