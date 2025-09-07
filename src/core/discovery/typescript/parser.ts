/**
 * TypeScript AST Parser
 * Uses the TypeScript Compiler API for accurate parsing of TypeScript files
 */

import ts from 'typescript';
import { AbstractParser } from '../../../types/discovery';
import type { ParsedFile, DiscoveryOptions, FunctionInfo, RouteInfo, ParameterInfo } from '../../../types/discovery';
import type { Result } from '../../../types/misc';
import type { CodeLocation } from '../../../types/misc';

export class TypeScriptParser extends AbstractParser {
  /**
   * Parse a TypeScript file and return the AST with metadata
   */
  parseFile(filePath: string, content: string): Result<ParsedFile<ts.SourceFile>> {
    try {
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
      );

      // Check for parse diagnostics if available - TypeScript internal API
      const diagnostics = (sourceFile as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics;
      if (diagnostics && diagnostics.length > 0) {
        const errors = diagnostics
          .map((diagnostic: ts.Diagnostic) =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
          )
          .join('\n');

        return {
          ok: false,
          error: new Error(`TypeScript parsing errors: ${errors}`),
        };
      }

      const parsed: ParsedFile<ts.SourceFile> = {
        filePath,
        content,
        ast: sourceFile,
        language: 'typescript',
      };

      return { ok: true, value: parsed };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  extractFunctions(parsedFile: ParsedFile<ts.SourceFile>, options: DiscoveryOptions = {}): Result<readonly FunctionInfo[]> {
    try {
      const defaultOptions: Required<DiscoveryOptions> = {
        includePrivate: false,
        includeNonExported: true,
        includeClassMethods: true,
        includeArrowFunctions: true,
        includeAnonymous: false,
      };

      const finalOptions = { ...defaultOptions, ...options };
      const functions = this.extractFunctionInfo(parsedFile.ast, parsedFile.ast);
      
      const filteredFunctions = functions.filter(func => this.shouldIncludeFunction(func, finalOptions));
      return { ok: true, value: filteredFunctions };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  extractRoutes(parsedFile: ParsedFile<ts.SourceFile>, _options: DiscoveryOptions = {}): Result<readonly RouteInfo[]> {
    try {
      const routes = this.extractRouteInfo(parsedFile.ast, parsedFile.ast);
      return { ok: true, value: routes };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  getSupportedExtensions(): readonly string[] {
    return ['.ts', '.tsx', '.js', '.jsx'];
  }

  getName(): string {
    return 'TypeScript';
  }

  /**
   * Extract function information from a TypeScript node
   */
  private extractFunctionInfo(
    node: ts.Node,
    sourceFile: ts.SourceFile
  ): FunctionInfo[] {
    const functions: FunctionInfo[] = [];

    const visit = (node: ts.Node): void => {
      if (
        ts.isFunctionDeclaration(node) ||
        ts.isMethodDeclaration(node) ||
        ts.isArrowFunction(node)
      ) {
        const funcInfo = this.createFunctionInfo(node, sourceFile);
        if (funcInfo) {
          functions.push(funcInfo);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(node);
    return functions;
  }

  /**
   * Create function information from a TypeScript function node
   */
  private createFunctionInfo(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction,
    sourceFile: ts.SourceFile
  ): FunctionInfo | null {
    const name = this.getFunctionName(node);
    if (!name) return null;

    const parameters = this.extractParameters(node);
    const returnType = this.getReturnType(node);
    const location = this.getSourceLocation(node, sourceFile);
    const isAsync = this.isAsyncFunction(node);
    const isExported = this.isExportedFunction(node);
    const jsDoc = this.getJSDocComment(node);

    return {
      name,
      signature: this.getFunctionSignature(node),
      parameters,
      ...(returnType && { returnType }),
      isAsync,
      isExported,
      location,
      ...(jsDoc && { jsDoc }),
    };
  }

  private getFunctionName(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction
  ): string | null {
    if (ts.isFunctionDeclaration(node) && node.name) {
      return node.name.text;
    }
    if (ts.isMethodDeclaration(node) && node.name) {
      return node.name.getText();
    }
    // For arrow functions, we might need to look at the parent to get the variable name
    if (
      ts.isArrowFunction(node) &&
      node.parent &&
      ts.isVariableDeclaration(node.parent)
    ) {
      return node.parent.name.getText();
    }
    return null;
  }

  public extractParameters(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction
  ): readonly ParameterInfo[] {
    return node.parameters.map((param) => {
      const name = param.name.getText();
      const type = param.type?.getText();
      const optional = !!param.questionToken;
      const defaultValue = param.initializer?.getText();

      return {
        name,
        ...(type && { type }),
        ...(optional && { optional }),
        ...(defaultValue && { defaultValue }),
      };
    });
  }

  private getReturnType(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction
  ): string | undefined {
    return node.type ? node.type.getText() : undefined;
  }

  private extractRouteInfo(
    node: ts.Node,
    sourceFile: ts.SourceFile
  ): RouteInfo[] {
    const routes: RouteInfo[] = [];
    
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const route = this.extractExpressRoute(node, sourceFile);
        if (route) {
          routes.push(route);
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(node);
    return routes;
  }

  private extractExpressRoute(node: ts.CallExpression, sourceFile: ts.SourceFile): RouteInfo | null {
    if (!ts.isPropertyAccessExpression(node.expression)) return null;
    
    const methodName = node.expression.name.text;
    const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'];
    
    if (!httpMethods.includes(methodName.toLowerCase())) return null;
    
    const args = node.arguments;
    if (args.length < 2) return null;
    
    const pathArg = args[0];
    if (!pathArg || !ts.isStringLiteral(pathArg)) return null;
    
    const handlerArg = args[args.length - 1];
    if (!handlerArg) return null;
    
    let handlerName = 'anonymous';
    
    if (ts.isIdentifier(handlerArg)) {
      handlerName = handlerArg.text;
    } else if (ts.isArrowFunction(handlerArg) || ts.isFunctionExpression(handlerArg)) {
      handlerName = 'inline function';
    }
    
    const location = this.getSourceLocation(node, sourceFile);
    
    return {
      path: pathArg.text,
      method: methodName.toUpperCase(),
      handler: handlerName,
      location,
      framework: 'express',
      middleware: this.extractMiddleware(args.slice(1, -1)),
    };
  }

  private extractMiddleware(middlewareArgs: readonly ts.Expression[]): string[] {
    return middlewareArgs.map(arg => {
      if (ts.isIdentifier(arg)) {
        return arg.text;
      }
      return 'middleware';
    });
  }

  private shouldIncludeFunction(func: FunctionInfo, options: Required<DiscoveryOptions>): boolean {
    if (!options.includeNonExported && !func.isExported) return false;
    if (!options.includeAnonymous && func.name === 'anonymous') return false;
    return true;
  }

  public getSourceLocation(
    node: ts.Node,
    sourceFile: ts.SourceFile
  ): CodeLocation {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());

    return {
      line: start.line + 1, // Convert to 1-based
      column: start.character + 1, // Convert to 1-based
    };
  }

  private isAsyncFunction(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction
  ): boolean {
    return (
      node.modifiers?.some((mod) => mod.kind === ts.SyntaxKind.AsyncKeyword) ??
      false
    );
  }

  private isExportedFunction(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction
  ): boolean {
    if (ts.isFunctionDeclaration(node)) {
      return (
        node.modifiers?.some(
          (mod) => mod.kind === ts.SyntaxKind.ExportKeyword
        ) ?? false
      );
    }
    return false;
  }

  private getJSDocComment(node: ts.Node): string | undefined {
    const jsDoc = ts.getJSDocCommentsAndTags(node);
    if (jsDoc.length > 0) {
      return jsDoc.map((doc) => doc.getText()).join('\n');
    }
    return undefined;
  }

  private getFunctionSignature(
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction
  ): string {
    return node.getText();
  }

  /**
   * Check if a file is TypeScript based on extension
   */
  static isTypeScriptFile(filePath: string): boolean {
    return /\.tsx?$/i.test(filePath);
  }

  /**
   * Get import statements from the source file
   */
  getImports(
    sourceFile: ts.SourceFile
  ): Array<{ module: string; imports: string[] }> {
    const imports: Array<{ module: string; imports: string[] }> = [];

    sourceFile.statements.forEach((statement) => {
      if (ts.isImportDeclaration(statement) && statement.moduleSpecifier) {
        const moduleSpecifier = (statement.moduleSpecifier as ts.StringLiteral)
          .text;
        const importList: string[] = [];

        if (statement.importClause) {
          const { name, namedBindings } = statement.importClause;

          if (name) {
            importList.push(name.text); // Default import
          }

          if (namedBindings) {
            if (ts.isNamespaceImport(namedBindings)) {
              importList.push(`* as ${namedBindings.name.text}`);
            } else if (ts.isNamedImports(namedBindings)) {
              namedBindings.elements.forEach((element) => {
                importList.push(element.name.text);
              });
            }
          }
        }

        imports.push({
          module: moduleSpecifier,
          imports: importList,
        });
      }
    });

    return imports;
  }
}
