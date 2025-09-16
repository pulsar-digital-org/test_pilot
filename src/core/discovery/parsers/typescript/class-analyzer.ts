import ts from "typescript";
import type {
	ClassInfo,
	ClassMethodInfo,
	ClassPropertyInfo,
} from "../../types/core";
import type { ParseContext } from "./extractors/base-extractor";
import { BaseExtractor } from "./extractors/base-extractor";
import { TypeGuards } from "./type-guards";

export class ClassAnalyzer extends BaseExtractor<ts.ClassDeclaration> {
	canHandle(node: ts.Node): node is ts.ClassDeclaration {
		return ts.isClassDeclaration(node);
	}

	extract(): never {
		throw new Error("Use analyzeClass method instead");
	}

	analyzeClass(node: ts.ClassDeclaration, context: ParseContext): ClassInfo {
		const className = node.name?.getText() || "anonymous";
		const properties: ClassPropertyInfo[] = [];
		const methods: ClassMethodInfo[] = [];
		const classJsDoc = this.getJsDoc(context, node);

		// Extract current class members
		node.members.forEach((member) => {
			if (ts.isPropertyDeclaration(member)) {
				const property = this.extractPropertyInfo(member);
				if (property) properties.push(property);
			} else if (
				TypeGuards.isFunctionLike(member) &&
				ts.isMethodDeclaration(member)
			) {
				const method = this.extractMethodInfo(context, member);
				if (method) methods.push(method);
			}
		});

		// Handle inheritance
		if (node.heritageClauses) {
			for (const heritageClause of node.heritageClauses) {
				if (heritageClause.token === ts.SyntaxKind.ExtendsKeyword) {
					for (const heritageType of heritageClause.types) {
						const parentClassInfo = this.extractParentClassInfo(
							context,
							heritageType,
						);
						if (parentClassInfo) {
							// Add parent properties and methods at the beginning
							properties.unshift(...parentClassInfo.properties);
							methods.unshift(...parentClassInfo.methods);
						}
					}
				}
			}
		}

		return {
			name: className,
			properties,
			methods,
			jsDoc: classJsDoc,
		};
	}

	private extractPropertyInfo(
		node: ts.PropertyDeclaration,
	): ClassPropertyInfo | null {
		const name = node.name?.getText();
		if (!name) return null;

		const type = node.type?.getText();
		const isPrivate = TypeGuards.hasModifier(
			node,
			ts.SyntaxKind.PrivateKeyword,
		);
		const isStatic = TypeGuards.hasModifier(node, ts.SyntaxKind.StaticKeyword);
		const isReadonly = TypeGuards.hasModifier(
			node,
			ts.SyntaxKind.ReadonlyKeyword,
		);

		return { name, type, isPrivate, isStatic, isReadonly };
	}

	private extractMethodInfo(
		context: ParseContext,
		node: ts.MethodDeclaration,
	): ClassMethodInfo | null {
		const name = TypeGuards.getFunctionName(node);
		const parameters = this.getFunctionParameters(context, node);
		const returnType = this.getReturnType(context, node);
		const isAsync = TypeGuards.isAsyncFunction(node);
		const jsDoc = this.getJsDoc(context, node);
		const isPrivate = TypeGuards.hasModifier(
			node,
			ts.SyntaxKind.PrivateKeyword,
		);
		const isStatic = TypeGuards.hasModifier(node, ts.SyntaxKind.StaticKeyword);

		return {
			name,
			parameters,
			returnType,
			isAsync,
			isPrivate,
			isStatic,
			jsDoc,
		};
	}

	private extractParentClassInfo(
		context: ParseContext,
		heritageType: ts.ExpressionWithTypeArguments,
	): ClassInfo | null {
		try {
			const parentClassName = heritageType.expression.getText();
			const parentNode = this.findClassDeclaration(
				context.sourceFile,
				parentClassName,
			);

			if (parentNode) {
				return this.analyzeClass(parentNode, context);
			}

			// Try to get type information for external classes
			const type = context.typeChecker.getTypeAtLocation(heritageType);
			return this.extractClassInfoFromType(context, type, parentClassName);
		} catch {
			return null;
		}
	}

	private findClassDeclaration(
		sourceFile: ts.SourceFile,
		className: string,
	): ts.ClassDeclaration | null {
		const visit = (node: ts.Node): ts.ClassDeclaration | null => {
			if (ts.isClassDeclaration(node) && node.name?.getText() === className) {
				return node;
			}
			for (const child of node.getChildren()) {
				const result = visit(child);
				if (result) return result;
			}
			return null;
		};
		return visit(sourceFile);
	}

	private extractClassInfoFromType(
		context: ParseContext,
		type: ts.Type,
		className: string,
	): ClassInfo {
		const properties: ClassPropertyInfo[] = [];
		const methods: ClassMethodInfo[] = [];

		for (const symbol of type.getProperties()) {
			const name = symbol.getName();
			const valueDecl = symbol.valueDeclaration;

			if (valueDecl && ts.isPropertySignature(valueDecl)) {
				properties.push({
					name,
					type: undefined,
					isPrivate: false,
					isStatic: false,
					isReadonly: false,
				});
			} else if (
				valueDecl &&
				(ts.isMethodSignature(valueDecl) || ts.isMethodDeclaration(valueDecl))
			) {
				const params = ts.isMethodDeclaration(valueDecl)
					? this.getFunctionParameters(context, valueDecl)
					: [];
				const returnType = ts.isMethodDeclaration(valueDecl)
					? this.getReturnType(context, valueDecl)
					: undefined;

				methods.push({
					name,
					parameters: params,
					returnType,
					isAsync: ts.isMethodDeclaration(valueDecl)
						? TypeGuards.isAsyncFunction(valueDecl)
						: false,
					isPrivate: false,
					isStatic: false,
					jsDoc: undefined,
				});
			}
		}

		return {
			name: className,
			properties,
			methods,
			jsDoc: undefined,
		};
	}
}

