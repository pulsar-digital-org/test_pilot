import ts from "typescript";

// biome-ignore lint/complexity/noStaticOnlyClass: <explanation>
export class TypeGuards {
	static isFunctionLike(node: ts.Node): node is ts.FunctionLikeDeclaration {
		return (
			ts.isFunctionDeclaration(node) ||
			ts.isMethodDeclaration(node) ||
			ts.isFunctionExpression(node) ||
			ts.isArrowFunction(node)
		);
	}

	static isPublicMethod(node: ts.MethodDeclaration): boolean {
		return (
			!this.hasModifier(node, ts.SyntaxKind.PrivateKeyword) &&
			!this.startsWithUnderscore(node)
		);
	}

	static isTopLevelFunction(node: ts.Node): boolean {
		const functionName = this.getFunctionName(node);
		if (functionName === "anonymous") return false;

		if (ts.isFunctionDeclaration(node)) {
			return true;
		}

		if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
			const parent = node.parent;
			if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) {
				return true;
			}
		}

		return false;
	}

	static isAsyncFunction(node: ts.FunctionLikeDeclaration): boolean {
		return !!ts
			.getModifiers(node)
			?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
	}

	static hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
		return ts.getModifiers(node)?.some((m) => m.kind === kind) ?? false;
	}

	static getFunctionName(node: ts.Node): string {
		const fn = node as ts.FunctionLikeDeclaration;

		if (ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) {
			return fn.name?.getText() || "anonymous";
		}

		if (ts.isFunctionExpression(fn)) {
			return fn.name?.getText() || "anonymous";
		}

		// Arrow function -> try variable/property name
		if (ts.isArrowFunction(fn)) {
			const parent = fn.parent;
			if (ts.isVariableDeclaration(parent)) return parent.name.getText();
			if (ts.isPropertyAssignment(parent)) return parent.name.getText();
			return "anonymous";
		}

		return "anonymous";
	}

	private static startsWithUnderscore(node: ts.MethodDeclaration): boolean {
		return node.name?.getText().startsWith("_") ?? false;
	}
}

