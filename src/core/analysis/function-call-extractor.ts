import ts from "typescript";
import type { FunctionCall } from "./types";

/**
 * Extracts function calls from TypeScript code using AST parsing
 * Follows the same patterns as the discovery module extractors
 */
export class FunctionCallExtractor {
	/**
	 * Extract all function calls from a code implementation
	 */
	extractCalls(implementation: string, fileName = "temp.ts"): FunctionCall[] {
		try {
			const { sourceFile, lineOffset } = this.createSourceFile(
				implementation,
				fileName,
			);
			const calls: FunctionCall[] = [];

			const visit = (node: ts.Node) => {
				if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
					const defaultType = ts.isNewExpression(node)
						? "constructor"
						: "function";
					const call = this.extractCall(
						node,
						sourceFile,
						lineOffset,
						defaultType,
					);
					if (call) calls.push(call);
				}

				ts.forEachChild(node, visit);
			};

			visit(sourceFile);
			return calls;
		} catch (error) {
			// Gracefully handle parse errors - return empty array
			console.warn(`Failed to extract function calls: ${error}`);
			return [];
		}
	}

	private extractCall(
		node: ts.CallExpression | ts.NewExpression,
		sourceFile: ts.SourceFile,
		lineOffset: number,
		defaultType: FunctionCall["type"],
	): FunctionCall | null {
		const { line, character } = sourceFile.getLineAndCharacterOfPosition(
			node.getStart(),
		);
		const position = {
			line: this.adjustLine(line + 1, lineOffset),
			column: character + 1,
		};
		const expression = node.expression;

		if (ts.isIdentifier(expression)) {
			return {
				name: expression.text,
				line: position.line,
				column: position.column,
				type: defaultType,
			};
		}

		if (
			defaultType !== "constructor" &&
			ts.isPropertyAccessExpression(expression)
		) {
			const receiver = this.extractReceiver(expression, sourceFile);
			return {
				name: expression.name.text,
				line: position.line,
				column: position.column,
				type: this.determineCallType(receiver),
				receiver,
			};
		}

		return null;
	}

	/**
	 * Extract the receiver (object/class) for method calls
	 */
	private extractReceiver(
		expression: ts.PropertyAccessExpression,
		sourceFile: ts.SourceFile,
	): string {
		if (ts.isIdentifier(expression.expression)) {
			return expression.expression.text;
		}
		// For complex expressions, get the full text
		return expression.expression.getText(sourceFile);
	}

	/**
	 * Determine if a method call is static or instance method
	 * Heuristic: if receiver starts with capital letter, assume static
	 */
	private determineCallType(receiver: string): "method" | "static" {
		const firstChar = receiver.charAt(0);
		return firstChar === firstChar.toUpperCase() &&
			firstChar !== firstChar.toLowerCase()
			? "static"
			: "method";
	}

	/**
	 * Create TypeScript source file for parsing
	 */
	private createSourceFile(
		content: string,
		fileName: string,
	): { sourceFile: ts.SourceFile; lineOffset: number } {
		const candidates = this.prepareSourceCandidates(content);

		for (const candidate of candidates) {
			const sourceFile = ts.createSourceFile(
				fileName,
				candidate.content,
				ts.ScriptTarget.Latest,
				true,
			);
			if ((sourceFile as any).parseDiagnostics.length === 0) {
				return { sourceFile, lineOffset: candidate.lineOffset };
			}
		}

		// Fallback to the first attempt even if it has diagnostics
		const fallback = candidates[0];
		return {
			sourceFile: ts.createSourceFile(
				fileName,
				fallback?.content ?? "",
				ts.ScriptTarget.Latest,
				true,
			),
			lineOffset: fallback?.lineOffset ?? 0,
		};
	}

	private prepareSourceCandidates(
		implementation: string,
	): Array<{ content: string; lineOffset: number }> {
		const trimmed = implementation.trim();
		const candidates: Array<{ content: string; lineOffset: number }> = [
			{ content: trimmed, lineOffset: 0 },
		];

		if (this.looksLikeClassMethod(trimmed)) {
			const prefix = "class __Temp__ {\n";
			const suffix = "\n}\n";
			candidates.push({
				content: `${prefix}${trimmed}${suffix}`,
				lineOffset: prefix.split("\n").length - 1,
			});
		}

		if (this.looksLikeBareBlock(trimmed)) {
			const prefix = "function __temp__() ";
			candidates.push({
				content: `${prefix}${trimmed}`,
				lineOffset: 0,
			});
		}

		return candidates;
	}

	private looksLikeClassMethod(code: string): boolean {
		if (!code) return false;
		const hasFunctionKeyword = /\bfunction\b/.test(code);
		const looksLikeArrow = /=>/.test(code);
		if (hasFunctionKeyword || looksLikeArrow) {
			return false;
		}
		const methodPattern =
			/^(?:public|private|protected|readonly|static|async|abstract|override|\s)*[\w$]+\s*\(/;
		return methodPattern.test(code);
	}

	private looksLikeBareBlock(code: string): boolean {
		return code.startsWith("{") && code.endsWith("}");
	}

	private adjustLine(line: number, offset: number): number {
		return Math.max(1, line - offset);
	}
}
