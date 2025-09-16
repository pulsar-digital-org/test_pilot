import ts from "typescript";
import type { FunctionInfo } from "../../../types/core";
import { FunctionInfoBuilder } from "../function-builder";
import { TypeGuards } from "../type-guards";
import { BaseExtractor, type ParseContext } from "./base-extractor";

export class FunctionDeclarationExtractor extends BaseExtractor<ts.FunctionDeclaration> {
	canHandle(node: ts.Node): node is ts.FunctionDeclaration {
		return ts.isFunctionDeclaration(node);
	}

	extract(
		node: ts.FunctionDeclaration,
		context: ParseContext,
	): FunctionInfo | null {
		const functionName = TypeGuards.getFunctionName(node);
		if (functionName === "anonymous") return null;

		return new FunctionInfoBuilder()
			.withName(functionName)
			.withFilePath(context.sourceFile.fileName)
			.withImplementation(this.getImplementation(context.sourceFile, node))
			.withParameters(this.getFunctionParameters(context, node))
			.withReturnType(this.getReturnType(context, node))
			.withAsync(TypeGuards.isAsyncFunction(node))
			.withJsDoc(this.getJsDoc(context, node))
			.build();
	}
}

