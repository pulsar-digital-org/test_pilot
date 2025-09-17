import ts from "typescript";
import type { ClassInfo, FunctionInfo } from "../../../types/core";
import { FunctionInfoBuilder } from "../function-builder";
import { TypeGuards } from "../type-guards";
import { BaseExtractor, type ParseContext } from "./base-extractor";

export class MethodDeclarationExtractor extends BaseExtractor<ts.MethodDeclaration> {
	canHandle(node: ts.Node): node is ts.MethodDeclaration {
		return ts.isMethodDeclaration(node);
	}

	extract(
		node: ts.MethodDeclaration,
		context: ParseContext,
		classInfo?: ClassInfo,
	): FunctionInfo | null {
		if (!TypeGuards.isPublicMethod(node)) {
			return null;
		}

		const methodName = TypeGuards.getFunctionName(node);
		const className = classInfo?.name;
		const displayName = className ? `${className}.${methodName}` : methodName;

		const position = this.getStartPosition(context.sourceFile, node);

		const builder = new FunctionInfoBuilder()
			.withName(displayName)
			.withFilePath(context.sourceFile.fileName)
			.withImplementation(this.getImplementation(context.sourceFile, node))
			.withLocation(position.line, position.column)
			.withParameters(this.getFunctionParameters(context, node))
			.withReturnType(this.getReturnType(context, node))
			.withAsync(TypeGuards.isAsyncFunction(node))
			.withJsDoc(this.getJsDoc(context, node));

		if (classInfo) {
			builder.withClassContext(classInfo);
		}

		return builder.build();
	}
}
