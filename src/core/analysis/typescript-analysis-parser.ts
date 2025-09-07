import ts from 'typescript';
import type { Result } from '../../types/misc';
import type { ParsedFile } from '../../types/discovery';
import type { IAnalysisParser, FunctionCall, TypeReference, ImportInfo } from './types';

export class TypeScriptAnalysisParser implements IAnalysisParser {
    extractFunctionCalls(parsedFile: ParsedFile<ts.SourceFile>, functionName: string): Result<readonly FunctionCall[]> {
        try {
            const calls: FunctionCall[] = [];
            const sourceFile = parsedFile.ast;
            
            // Find the target function first
            const targetFunction = this.findFunction(sourceFile, functionName);
            if (!targetFunction) {
                return { ok: true, value: [] };
            }

            // Visit all nodes within the function body
            const visitNode = (node: ts.Node): void => {
                if (ts.isCallExpression(node)) {
                    const call = this.extractCallExpression(node, sourceFile);
                    if (call) {
                        calls.push(call);
                    }
                }
                ts.forEachChild(node, visitNode);
            };

            if (targetFunction.body) {
                visitNode(targetFunction.body);
            }

            return { ok: true, value: calls };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }

    extractTypeReferences(parsedFile: ParsedFile<ts.SourceFile>, functionName: string): Result<readonly TypeReference[]> {
        try {
            const types: TypeReference[] = [];
            const sourceFile = parsedFile.ast;
            
            const targetFunction = this.findFunction(sourceFile, functionName);
            if (!targetFunction) {
                return { ok: true, value: [] };
            }

            // Extract parameter types
            targetFunction.parameters.forEach(param => {
                if (param.type) {
                    const typeRef = this.extractTypeFromNode(param.type, sourceFile);
                    if (typeRef) {
                        types.push(typeRef);
                    }
                }
            });

            // Extract return type
            if (targetFunction.type) {
                const returnTypeRef = this.extractTypeFromNode(targetFunction.type, sourceFile);
                if (returnTypeRef) {
                    types.push(returnTypeRef);
                }
            }

            // Extract variable declaration types within function
            const visitNode = (node: ts.Node): void => {
                if (ts.isVariableDeclaration(node) && node.type) {
                    const typeRef = this.extractTypeFromNode(node.type, sourceFile);
                    if (typeRef) {
                        types.push(typeRef);
                    }
                }
                ts.forEachChild(node, visitNode);
            };

            if (targetFunction.body) {
                visitNode(targetFunction.body);
            }

            return { ok: true, value: types };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }

    extractImports(parsedFile: ParsedFile<ts.SourceFile>): Result<readonly ImportInfo[]> {
        try {
            const imports: ImportInfo[] = [];
            const sourceFile = parsedFile.ast;

            sourceFile.statements.forEach(statement => {
                if (ts.isImportDeclaration(statement) && statement.moduleSpecifier) {
                    const moduleSpecifier = (statement.moduleSpecifier as ts.StringLiteral).text;
                    const location = this.getSourceLocation(statement, sourceFile);

                    if (statement.importClause) {
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
                            if (ts.isNamespaceImport(namedBindings)) {
                                imports.push({
                                    modulePath: moduleSpecifier,
                                    importedName: '*',
                                    ...(namedBindings.name.text && { aliasName: namedBindings.name.text }),
                                    location
                                });
                            } else if (ts.isNamedImports(namedBindings)) {
                                namedBindings.elements.forEach(element => {
                                    imports.push({
                                        modulePath: moduleSpecifier,
                                        importedName: element.propertyName?.text || element.name.text,
                                        ...(element.propertyName && { aliasName: element.name.text }),
                                        location
                                    });
                                });
                            }
                        }
                    }
                }
            });

            return { ok: true, value: imports };
        } catch (error) {
            return {
                ok: false,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }

    private findFunction(sourceFile: ts.SourceFile, functionName: string): ts.FunctionDeclaration | ts.MethodDeclaration | null {
        let targetFunction: ts.FunctionDeclaration | ts.MethodDeclaration | null = null;

        const visit = (node: ts.Node): void => {
            if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
                targetFunction = node;
                return;
            }
            if (ts.isMethodDeclaration(node) && node.name?.getText() === functionName) {
                targetFunction = node;
                return;
            }
            ts.forEachChild(node, visit);
        };

        visit(sourceFile);
        return targetFunction;
    }

    private extractCallExpression(node: ts.CallExpression, sourceFile: ts.SourceFile): FunctionCall | null {
        let functionName: string;

        if (ts.isIdentifier(node.expression)) {
            functionName = node.expression.text;
        } else if (ts.isPropertyAccessExpression(node.expression)) {
            functionName = node.expression.name.text;
        } else {
            return null;
        }

        const location = this.getSourceLocation(node, sourceFile);
        const args = node.arguments.map(arg => arg.getText());

        return {
            name: functionName,
            location,
            arguments: args
        };
    }

    private extractTypeFromNode(typeNode: ts.TypeNode, sourceFile: ts.SourceFile): TypeReference | null {
        const location = this.getSourceLocation(typeNode, sourceFile);
        const typeName = typeNode.getText();

        // Handle basic types
        if (ts.isTypeReferenceNode(typeNode) && ts.isIdentifier(typeNode.typeName)) {
            return {
                name: typeNode.typeName.text,
                location,
                definition: typeName
            };
        }

        // Handle other type nodes
        return {
            name: typeName,
            location,
            definition: typeName
        };
    }

    private getSourceLocation(node: ts.Node, sourceFile: ts.SourceFile) {
        const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        return {
            line: start.line + 1,
            column: start.character + 1
        };
    }
}