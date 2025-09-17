import { readFileSync } from "node:fs";
import type { FunctionInfo } from "../discovery/types/core";
import { FunctionCallExtractor } from "./function-call-extractor";
import { LSPClientManager } from "./lsp-client-manager";
import type {
	AnalysisConfig,
	EnhancedFunctionInfo,
	FunctionAnalysis,
	FunctionCall,
	InternalFunctionInfo,
	LSPDocumentation,
} from "./types";

type DocumentationMap = Map<string, LSPDocumentation>;

interface AnalysisContext {
	allFunctions: readonly FunctionInfo[];
	functionByKey: Map<string, FunctionInfo>;
	childrenByKey: Map<string, Set<string>>;
	parentsByKey: Map<string, Set<string>>;
	unresolvedCallsByKey: Map<string, Map<string, FunctionCall>>;
}

/**
 * CodeAnalysis - Dead simple API for analyzing function relationships
 * Follows the same fluent pattern as CodeDiscovery
 */
export class CodeAnalysis {
	private config: AnalysisConfig = {
		includeParentsAndChildren: false,
		includeInternalFunctions: false,
		includeLSPDocumentation: false,
		timeout: 5000,
		maxDepth: 10,
	};

	private callExtractor = new FunctionCallExtractor();
	private lspManager?: LSPClientManager | undefined;
	private allFunctions: readonly FunctionInfo[] = [];

	/**
	 * Provide discovery results to the analysis pipeline
	 */
	constructor(functions: readonly FunctionInfo[] = []) {
		if (functions.length) {
			this.allFunctions = functions;
		}
	}

	/**
	 * Enable parent/child function analysis
	 */
	withParentsAndChildren(enabled = true): this {
		this.config.includeParentsAndChildren = enabled;
		return this;
	}

	/**
	 * Enable internal/external function detection
	 */
	withInternalFunctions(enabled = true): this {
		this.config.includeInternalFunctions = enabled;
		return this;
	}

	/**
	 * Enable LSP documentation enhancement
	 */
	withLSPDocumentation(enabled = true): this {
		this.config.includeLSPDocumentation = enabled;
		if (enabled && !this.lspManager) {
			this.lspManager = new LSPClientManager({
				timeout: this.config.timeout ?? 5000,
			});
		}
		if (!enabled && this.lspManager) {
			// Dispose lazily when documentation is disabled
			void this.lspManager.dispose();
			this.lspManager = undefined;
		}
		return this;
	}

	/**
	 * Set timeout for LSP operations
	 */
	withTimeout(ms: number): this {
		this.config.timeout = ms;
		// Note: LSP manager recreation would be async, so we just update config
		// Real implementation could recreate manager on next use
		return this;
	}

	/**
	 * Set maximum analysis depth
	 */
	withMaxDepth(depth: number): this {
		this.config.maxDepth = depth;
		return this;
	}

	/**
	 * Supply the discovery results after construction
	 */
	withFunctions(functions: readonly FunctionInfo[]): this {
		this.allFunctions = functions;
		return this;
	}

	/**
	 * Analyze a single function and enhance it with relationship data
	 */
	async analyzeFunction(
		targetFunction: FunctionInfo | string,
		allFunctions?: readonly FunctionInfo[],
	): Promise<EnhancedFunctionInfo | undefined> {
		const resolvedTarget =
			typeof targetFunction === "string"
				? this.findFunctionByName(targetFunction, allFunctions)
				: targetFunction;

		if (!resolvedTarget) {
			throw new Error(
				`Function '${typeof targetFunction === "string" ? targetFunction : targetFunction.name}' not found in discovery results`,
			);
		}

		const [result] = await this.analyzeFunctions(
			[resolvedTarget],
			allFunctions,
		);
		return result;
	}

	/**
	 * Analyze multiple functions and enhance them with relationship data
	 */
	async analyzeFunctions(
		targetFunctions?: readonly FunctionInfo[],
		allFunctions?: readonly FunctionInfo[],
	): Promise<readonly EnhancedFunctionInfo[]> {
		let pool = allFunctions?.length
			? allFunctions
			: this.allFunctions.length
				? this.allFunctions
				: undefined;

		if (!pool?.length && targetFunctions?.length) {
			pool = targetFunctions;
		}

		if (!pool?.length) {
			throw new Error(
				"CodeAnalysis requires discovery results. Provide them via the constructor, withFunctions(), or the analyzeFunctions API.",
			);
		}

		const targets = targetFunctions?.length ? targetFunctions : pool;
		if (!targets.length) {
			return [];
		}

		this.allFunctions = pool;
		const context = this.buildAnalysisContext(pool);
		const enhancedResults: EnhancedFunctionInfo[] = [];

		for (const target of targets) {
			const enhanced = await this.enhanceFunction(target, context);
			enhancedResults.push(enhanced);
		}

		this.linkEnhancedResults(enhancedResults);
		return enhancedResults;
	}

	/**
	 * Analyze all known functions in one go
	 */
	async analyzeAll(): Promise<readonly EnhancedFunctionInfo[]> {
		return this.analyzeFunctions();
	}

	/**
	 * Dispose resources (LSP connections, etc.)
	 */
	async dispose(): Promise<void> {
		if (this.lspManager) {
			await this.lspManager.dispose();
		}
	}

	private buildAnalysisContext(
		functions: readonly FunctionInfo[],
	): AnalysisContext {
		const functionByKey = new Map<string, FunctionInfo>();
		const lookup = new Map<string, FunctionInfo[]>();
		const childrenByKey = new Map<string, Set<string>>();
		const parentsByKey = new Map<string, Set<string>>();
		const unresolvedByKey = new Map<string, Map<string, FunctionCall>>();

		for (const fn of functions) {
			const key = this.createFunctionKey(fn);
			functionByKey.set(key, fn);

			for (const lookupKey of this.buildLookupKeys(fn)) {
				const existing = lookup.get(lookupKey);
				if (existing) {
					existing.push(fn);
				} else {
					lookup.set(lookupKey, [fn]);
				}
			}
		}

		for (const fn of functions) {
			const key = this.createFunctionKey(fn);
			const calls = this.callExtractor.extractCalls(
				fn.implementation,
				fn.filePath,
			);

			if (
				this.config.includeParentsAndChildren ||
				this.config.includeInternalFunctions
			) {
				const childSet = this.config.includeParentsAndChildren
					? new Set<string>()
					: undefined;
				const unresolved = this.config.includeInternalFunctions
					? new Map<string, FunctionCall>()
					: undefined;

				for (const call of calls) {
					const matches = this.resolveCallTargets(fn, call, lookup);
					if (matches.length > 0) {
						if (childSet) {
							for (const match of matches) {
								const childKey = this.createFunctionKey(match);
								childSet.add(childKey);
								if (!parentsByKey.has(childKey)) {
									parentsByKey.set(childKey, new Set());
								}
								parentsByKey.get(childKey)?.add(key);
							}
						}
					} else if (unresolved) {
						const unresolvedKey = this.getInternalCallKey(call);
						if (!unresolved.has(unresolvedKey)) {
							unresolved.set(unresolvedKey, call);
						}
					}
				}

				if (childSet) {
					childrenByKey.set(key, childSet);
				}
				if (unresolved) {
					unresolvedByKey.set(key, unresolved);
				}
			}
		}

		if (this.config.includeParentsAndChildren) {
			for (const fn of functions) {
				const key = this.createFunctionKey(fn);
				if (!childrenByKey.has(key)) {
					childrenByKey.set(key, new Set());
				}
				if (!parentsByKey.has(key)) {
					parentsByKey.set(key, new Set());
				}
			}
		}

		return {
			allFunctions: functions,
			functionByKey,
			childrenByKey,
			parentsByKey,
			unresolvedCallsByKey: unresolvedByKey,
		};
	}

	private async enhanceFunction(
		target: FunctionInfo,
		context: AnalysisContext,
	): Promise<EnhancedFunctionInfo> {
		const key = this.createFunctionKey(target);
		const original = context.functionByKey.get(key) ?? target;
		const analysis: FunctionAnalysis = {
			parents: [],
			children: [],
			functions: [],
		};

		if (this.config.includeParentsAndChildren) {
			const parentKeys = context.parentsByKey.get(key);
			if (parentKeys && parentKeys.size > 0) {
				analysis.parents = Array.from(parentKeys)
					.map((parentKey) => context.functionByKey.get(parentKey))
					.filter((fn): fn is FunctionInfo => Boolean(fn));
			}

			const childKeys = context.childrenByKey.get(key);
			if (childKeys && childKeys.size > 0) {
				analysis.children = Array.from(childKeys)
					.map((childKey) => context.functionByKey.get(childKey))
					.filter((fn): fn is FunctionInfo => Boolean(fn));
			}
		}

		if (this.config.includeInternalFunctions) {
			const unresolved =
				context.unresolvedCallsByKey.get(key) ??
				new Map<string, FunctionCall>();
			analysis.functions = await this.createInternalFunctionInfos(
				original,
				unresolved,
			);
		}

		return { ...original, analysis };
	}

	private linkEnhancedResults(results: EnhancedFunctionInfo[]): void {
		if (!this.config.includeParentsAndChildren || results.length === 0) {
			return;
		}

		const lookup = new Map<string, EnhancedFunctionInfo>();
		for (const result of results) {
			lookup.set(this.createFunctionKey(result), result);
		}

		for (const result of results) {
			const analysis = result.analysis;
			if (!analysis) continue;
			analysis.parents = analysis.parents.map((parent) => {
				const enhanced = lookup.get(this.createFunctionKey(parent));
				return enhanced ?? parent;
			});
			analysis.children = analysis.children.map((child) => {
				const enhanced = lookup.get(this.createFunctionKey(child));
				return enhanced ?? child;
			});
		}
	}

	private async createInternalFunctionInfos(
		targetFunction: FunctionInfo,
		unresolvedCalls: Map<string, FunctionCall>,
	): Promise<InternalFunctionInfo[]> {
		if (unresolvedCalls.size === 0) {
			return [];
		}

		let documentation: DocumentationMap | undefined;

		if (this.config.includeLSPDocumentation && this.lspManager) {
			try {
				documentation = await this.lspManager.getDocumentation(
					targetFunction.filePath,
					this.toAbsoluteCallPositions(
						targetFunction,
						unresolvedCalls.values(),
					),
				);
			} catch (error) {
				console.warn(
					`LSP documentation failed for ${targetFunction.name}:`,
					error,
				);
			}
		}

		const internalInfos: InternalFunctionInfo[] = [];
		const absolutePositions = this.toAbsoluteCallPositions(
			targetFunction,
			unresolvedCalls.values(),
		);

		for (const [callKey, call] of unresolvedCalls) {
			const docEntry = documentation?.get(call.name);
			const jsDoc =
				docEntry?.documentation ??
				docEntry?.signature ??
				`External function: ${callKey}`;

			// Find the corresponding absolute position for this call
			const absolutePos = absolutePositions.find(
				(pos) => pos.name === call.name,
			);
			const line = absolutePos?.line ?? 0;
			const column = absolutePos?.column ?? 0;

			const internalInfo: InternalFunctionInfo = {
				name: callKey,
				jsDoc,
				line,
				column,
				parents: [targetFunction],
			};

			// Only include LSP documentation if it has a meaningful signature
			if (docEntry?.signature &&
			    docEntry.signature !== "any" &&
			    !docEntry.signature.includes("(...args: any[]): any")) {
				internalInfo.lspDocumentation = docEntry;
			}

			internalInfos.push(internalInfo);
		}

		return internalInfos;
	}

	private resolveCallTargets(
		currentFunction: FunctionInfo,
		call: FunctionCall,
		lookup: Map<string, FunctionInfo[]>,
	): FunctionInfo[] {
		const matches = new Set<FunctionInfo>();
		this.collectMatches(matches, lookup, call.name);
		if (call.receiver) {
			this.collectMatches(matches, lookup, `${call.receiver}.${call.name}`);
			if (call.receiver === "this" && currentFunction.classContext) {
				this.collectMatches(
					matches,
					lookup,
					`${currentFunction.classContext.name}.${call.name}`,
				);
			}
		}
		if (currentFunction.classContext) {
			this.collectMatches(
				matches,
				lookup,
				`${currentFunction.classContext.name}.${call.name}`,
			);
		}

		return [...matches];
	}

	private collectMatches(
		matches: Set<FunctionInfo>,
		lookup: Map<string, FunctionInfo[]>,
		key: string | undefined,
	): void {
		if (!key) return;
		const found = lookup.get(key);
		if (!found) return;
		for (const fn of found) {
			matches.add(fn);
		}
	}

	private createFunctionKey(fn: FunctionInfo): string {
		return `${fn.filePath}::${fn.name}`;
	}

	private buildLookupKeys(fn: FunctionInfo): string[] {
		const keys = new Set<string>();
		const simpleName = this.getSimpleName(fn.name);
		keys.add(fn.name);
		if (simpleName) {
			keys.add(simpleName);
		}
		if (fn.classContext && simpleName) {
			keys.add(`${fn.classContext.name}.${simpleName}`);
		}
		return Array.from(keys).filter(Boolean);
	}

	private getSimpleName(name: string): string {
		const parts = name.split(".");
		return parts[parts.length - 1] ?? name;
	}

	private getInternalCallKey(call: FunctionCall): string {
		// For method calls on 'this', just use the method name
		// For external receivers, include the receiver
		return call.receiver && call.receiver !== "this"
			? `${call.receiver}.${call.name}`
			: call.name;
	}

	private findFunctionByName(
		name: string,
		allFunctions?: readonly FunctionInfo[],
	): FunctionInfo | undefined {
		const pool = allFunctions ?? this.allFunctions;
		return pool.find((fn) => fn.name === name || fn.name.endsWith(`.${name}`));
	}

	private toAbsoluteCallPositions(
		functionInfo: FunctionInfo,
		calls: Iterable<FunctionCall>,
	): Array<{ name: string; line: number; column: number }> {
		const base = this.getFunctionBasePosition(functionInfo);
		const absoluteCalls: Array<{ name: string; line: number; column: number }> = [];
		const fileLines = this.tryReadFileLines(functionInfo.filePath);

		for (const call of calls) {
			const line = base.line + (call.line - 1);
			const columnOffset = call.line === 1 ? base.column - 1 : 0;
			const initialColumn = columnOffset + (call.column ?? 1);
			const adjustedColumn = this.resolveColumnForCall(
				fileLines,
				call,
				line,
				initialColumn,
			);

			absoluteCalls.push({
				name: call.name,
				line,
				column: adjustedColumn,
			});
		}

		return absoluteCalls;
	}

	private resolveColumnForCall(
		fileLines: string[] | null,
		call: FunctionCall,
		line: number,
		fallbackColumn: number,
	): number {
		if (!fileLines) {
			return fallbackColumn;
		}

		const targetLine = fileLines[line - 1] ?? "";
		if (!targetLine) {
			return fallbackColumn;
		}

		const zeroBasedFallback = Math.max(0, fallbackColumn - 1);
		let matchIndex = targetLine.indexOf(call.name, zeroBasedFallback);

		if (matchIndex < 0) {
			// Try searching from the beginning if the fallback overshot the name
			matchIndex = targetLine.indexOf(call.name);
		}

		if (matchIndex < 0 && call.receiver) {
			const composite = `${call.receiver}.${call.name}`;
			const receiverIndex = targetLine.indexOf(composite, zeroBasedFallback);
			if (receiverIndex >= 0) {
				matchIndex = receiverIndex + call.receiver.length + 1; // point to method name
			}
		}

		if (matchIndex < 0) {
			const optionalIndex = targetLine.indexOf(`?.${call.name}`, zeroBasedFallback);
			if (optionalIndex >= 0) {
				matchIndex = optionalIndex + 2; // skip "?."
			}
		}

		if (matchIndex < 0 && call.type === "constructor") {
			matchIndex = targetLine.indexOf(call.name);
		}

		return matchIndex >= 0 ? matchIndex + 1 : fallbackColumn;
	}

	private tryReadFileLines(filePath: string): string[] | null {
		try {
			const content = readFileSync(filePath, "utf8");
			return content.split(/\r?\n/);
		} catch (error) {
			console.warn(`Unable to read source file at ${filePath}:`, error);
			return null;
		}
	}

	private getFunctionBasePosition(functionInfo: FunctionInfo): {
		line: number;
		column: number;
	} {
		return {
			line: functionInfo.startLine ?? 1,
			column: functionInfo.startColumn ?? 1,
		};
	}
}
