import ts from "typescript";
import type { FunctionInfo } from "../../../types/core";
import { FunctionInfoBuilder } from "../function-builder";
import { TypeGuards } from "../type-guards";
import { BaseExtractor, type ParseContext } from "./base-extractor";

export class ArrowFunctionExtractor extends BaseExtractor<ts.ArrowFunction> {
	canHandle(node: ts.Node): node is ts.ArrowFunction {
		return ts.isArrowFunction(node);
	}

	extract(node: ts.ArrowFunction, context: ParseContext): FunctionInfo | null {
		if (!TypeGuards.isTopLevelFunction(node)) {
			return null;
		}

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

