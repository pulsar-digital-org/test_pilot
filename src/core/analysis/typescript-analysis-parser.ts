import ts from 'typescript';
import type { Result } from '../../types/misc';
import type { ParsedFile } from '../../types/discovery';
import type { IAnalysisParser, FunctionCall, TypeReference, ImportInfo } from './types';

/**
 * Optimized TypeScript analysis parser for extracting function calls, type references, and imports
 * Uses TypeScript Compiler API for accurate AST traversal and analysis
 */
export class TypeScriptAnalysisParser implements IAnalysisParser {
    extractFunctionCalls(parsedFile: ParsedFile<ts.SourceFile>, functionName: string): Result<readonly FunctionCall[]> {
        try {
            const sourceFile = parsedFile.ast;
            const targetFunction = this.findFunctionDeclaration(sourceFile, functionName);
            
            if (!targetFunction?.body) {
                return { ok: true, value: [] };
            }

            const calls: FunctionCall[] = [];
            this.visitNode(targetFunction.body, (node) => {
                if (ts.isCallExpression(node)) {
                    const call = this.createFunctionCall(node, sourceFile);
                    if (call) calls.push(call);
                }
            });

            return { ok: true, value: calls };
        } catch (error) {
            return this.createErrorResult(error);
        }
    }

    extractTypeReferences(parsedFile: ParsedFile<ts.SourceFile>, functionName: string): Result<readonly TypeReference[]> {
        try {
            const sourceFile = parsedFile.ast;
            const targetFunction = this.findFunctionDeclaration(sourceFile, functionName);
            
            if (!targetFunction) {
                return { ok: true, value: [] };
            }

            const types: TypeReference[] = [];

            // Extract parameter and return types
            this.extractSignatureTypes(targetFunction, sourceFile, types);

            // Extract types from function body
            if (targetFunction.body) {
                this.visitNode(targetFunction.body, (node) => {
                    if (ts.isVariableDeclaration(node) && node.type) {
                        const typeRef = this.createTypeReference(node.type, sourceFile);
                        if (typeRef) types.push(typeRef);
                    }
                });
            }

            return { ok: true, value: types };
        } catch (error) {
            return this.createErrorResult(error);
        }
    }

    extractImports(parsedFile: ParsedFile<ts.SourceFile>): Result<readonly ImportInfo[]> {
        try {
            const sourceFile = parsedFile.ast;
            const imports: ImportInfo[] = [];

            for (const statement of sourceFile.statements) {
                if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
                    this.processImportDeclaration(statement, sourceFile, imports);
                }
            }

            return { ok: true, value: imports };
        } catch (error) {
            return this.createErrorResult(error);
        }
    }

    private findFunctionDeclaration(sourceFile: ts.SourceFile, functionName: string): ts.FunctionDeclaration | ts.MethodDeclaration | null {
        let targetFunction: ts.FunctionDeclaration | ts.MethodDeclaration | null = null;

        this.visitNode(sourceFile, (node) => {
            if (this.isFunctionWithName(node, functionName)) {
                targetFunction = node as ts.FunctionDeclaration | ts.MethodDeclaration;
                return false; // Stop traversal
            }
        });

        return targetFunction;
    }

    private createFunctionCall(node: ts.CallExpression, sourceFile: ts.SourceFile): FunctionCall | null {
        const functionName = this.extractCallExpressionName(node.expression);
        if (!functionName) return null;

        return {
            name: functionName,
            location: this.getNodeLocation(node, sourceFile),
            arguments: node.arguments.map(arg => arg.getText())
        };
    }

    private createTypeReference(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): TypeReference | null {
        const typeName = this.extractTypeName(typeNode);
        if (!typeName) return null;

        return {
            name: typeName,
            location: this.getNodeLocation(typeNode, sourceFile),
            definition: typeNode.getText()
        };
    }

    private getNodeLocation(node: ts.Node, sourceFile: ts.SourceFile) {
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        return {
            line: start.line + 1,
            column: start.character + 1
        };
    }

    private visitNode(node: ts.Node, callback: (node: ts.Node) => boolean | void): void {
        const shouldContinue = callback(node);
        if (shouldContinue !== false) {
            ts.forEachChild(node, (child) => this.visitNode(child, callback));
        }
    }

    private isFunctionWithName(node: ts.Node, functionName: string): boolean {
        return (
            (ts.isFunctionDeclaration(node) && node.name?.text === functionName) ||
            (ts.isMethodDeclaration(node) && node.name?.getText() === functionName)
        );
    }

    private extractCallExpressionName(expression: ts.Expression): string | null {
        if (ts.isIdentifier(expression)) {
            return expression.text;
        }
        if (ts.isPropertyAccessExpression(expression)) {
            return expression.name.text;
        }
        return null;
    }

    private extractTypeName(typeNode: ts.TypeNode): string | null {
        if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
            return typeNode.typeName.text;
        }
        return typeNode.getText() || null;
    }

    private extractSignatureTypes(
        functionNode: ts.FunctionDeclaration | ts.MethodDeclaration,
        sourceFile: ts.SourceFile,
        types: TypeReference[]
    ): void {
        // Extract parameter types
        for (const param of functionNode.parameters) {
            if (param.type) {
                const typeRef = this.createTypeReference(param.type, sourceFile);
                if (typeRef) types.push(typeRef);
            }
        }

        // Extract return type
        if (functionNode.type) {
            const returnTypeRef = this.createTypeReference(functionNode.type, sourceFile);
            if (returnTypeRef) types.push(returnTypeRef);
        }
    }

    private processImportDeclaration(
        statement: ts.ImportDeclaration,
        sourceFile: ts.SourceFile,
        imports: ImportInfo[]
    ): void {
        const moduleSpecifier = (statement.moduleSpecifier as ts.StringLiteral).text;
        const location = this.getNodeLocation(statement, sourceFile);

        if (!statement.importClause) return;

        const { name, namedBindings } = statement.importClause;

        // Default import
        if (name) {
            imports.push({
                modulePath: moduleSpecifier,
                importedName: name.text,
                isDefault: true,
                location
            });
        }

        // Named imports
        if (namedBindings) {
            this.processNamedBindings(namedBindings, moduleSpecifier, location, imports);
        }
    }

    private processNamedBindings(
        namedBindings: ts.NamedImportBindings,
        moduleSpecifier: string,
        location: { line: number; column: number },
        imports: ImportInfo[]
    ): void {
        if (ts.isNamespaceImport(namedBindings)) {
            imports.push({
                modulePath: moduleSpecifier,
                importedName: '*',
                aliasName: namedBindings.name.text,
                location
            });
        } else if (ts.isNamedImports(namedBindings)) {
            for (const element of namedBindings.elements) {
                imports.push({
                    modulePath: moduleSpecifier,
                    importedName: element.propertyName?.text || element.name.text,
                    ...(element.propertyName && { aliasName: element.name.text }),
                    location
                });
            }
        }
    }

    private createErrorResult(error: unknown): Result<never> {
        return {
            ok: false,
            error: error instanceof Error ? error : new Error(String(error))
        };
    }
}