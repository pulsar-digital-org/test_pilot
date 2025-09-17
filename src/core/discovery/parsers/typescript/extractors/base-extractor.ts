import ts from "typescript";
import type { FunctionInfo, ParameterInfo } from "../../../types/core";

export interface ParseContext {
	program: ts.Program;
	typeChecker: ts.TypeChecker;
	sourceFile: ts.SourceFile;
}

export interface NodeExtractor<T extends ts.Node> {
	canHandle(node: ts.Node): node is T;
	extract(node: T, context: ParseContext): FunctionInfo | null;
}

export abstract class BaseExtractor<T extends ts.Node>
	implements NodeExtractor<T>
{
	abstract canHandle(node: ts.Node): node is T;
	abstract extract(node: T, context: ParseContext): FunctionInfo | null;

	protected getImplementation(
		sourceFile: ts.SourceFile,
		node: ts.Node,
	): string {
		return node.getText(sourceFile).trim();
	}

	protected getStartPosition(
		sourceFile: ts.SourceFile,
		node: ts.Node,
	): {
		line: number;
		column: number;
	} {
		const { line, character } = sourceFile.getLineAndCharacterOfPosition(
			node.getStart(sourceFile, false),
		);
		return { line: line + 1, column: character + 1 };
	}

	protected getReturnType(
		ctx: ParseContext,
		node: ts.FunctionLikeDeclaration,
	): string | undefined {
		// Explicit annotation first
		if (node.type) {
			return node.type.getText();
		}

		// Infer using type checker
		try {
			const signature = ctx.typeChecker.getSignatureFromDeclaration(node);
			if (signature) {
				const type = ctx.typeChecker.getReturnTypeOfSignature(signature);
				return ctx.typeChecker.typeToString(type);
			}
		} catch {
			// ignore
		}
		return undefined;
	}

	protected getFunctionParameters(
		ctx: ParseContext,
		node: ts.FunctionLikeDeclaration,
	): readonly ParameterInfo[] {
		return node.parameters.map((param) => {
			const name = param.name.getText();
			const type =
				param.type?.getText() ??
				this.getParameterTypeFromTypeChecker(ctx, param);
			const optional = !!param.questionToken;
			const defaultValue = param.initializer
				? param.initializer.getText()
				: undefined;

			return { name, type, optional, defaultValue };
		});
	}

	protected getParameterTypeFromTypeChecker(
		ctx: ParseContext,
		param: ts.ParameterDeclaration,
	): string | undefined {
		try {
			const type = ctx.typeChecker.getTypeAtLocation(param);
			return ctx.typeChecker.typeToString(type);
		} catch {
			return undefined;
		}
	}

	protected getJsDoc(ctx: ParseContext, node: ts.Node): string | undefined {
		const jsDocComments = ts.getJSDocCommentsAndTags(node);
		const jsDocTexts: string[] = [];

		for (const jsDoc of jsDocComments) {
			if (ts.isJSDoc(jsDoc)) {
				const fullText = jsDoc.getFullText(ctx.sourceFile);
				jsDocTexts.push(fullText.trim());
			}
		}

		return jsDocTexts.length > 0 ? jsDocTexts.join("\n") : undefined;
	}
}
