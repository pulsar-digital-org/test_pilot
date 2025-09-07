/**
 * Function Discovery Module
 * Language-agnostic function and route discovery using parser delegation
 */

import type { AbstractParser, DiscoveryOptions, FunctionInfo, RouteInfo } from '../../types/discovery';
import type { Result } from '../../types/misc';
import { ParserFactory } from './function-parser-factory';

export class FunctionDiscovery {
  private parser: AbstractParser | undefined;
  private parserFactory: ParserFactory;

  constructor(parser?: AbstractParser) {
    this.parser = parser;
    this.parserFactory = ParserFactory.getInstance();
  }

  /**
   * Discover all functions in a file
   */
  discoverFunctions(
    filePath: string,
    content: string,
    options: DiscoveryOptions = {}
  ): Result<readonly FunctionInfo[]> {
    const parser = this.getParser(filePath);
    if (!parser) {
      return {
        ok: false,
        error: new Error(`No parser found for file: ${filePath}`)
      };
    }

    const parseResult = parser.parseFile(filePath, content);
    if (!parseResult.ok) {
      return parseResult;
    }

    return parser.extractFunctions(parseResult.value, options);
  }

  /**
   * Discover all routes in a file
   */
  discoverRoutes(
    filePath: string,
    content: string,
    options: DiscoveryOptions = {}
  ): Result<readonly RouteInfo[]> {
    const parser = this.getParser(filePath);
    if (!parser) {
      return {
        ok: false,
        error: new Error(`No parser found for file: ${filePath}`)
      };
    }

    const parseResult = parser.parseFile(filePath, content);
    if (!parseResult.ok) {
      return { ok: false, error: parseResult.error };
    }

    return parser.extractRoutes(parseResult.value, options);
  }

  private getParser(filePath: string): AbstractParser | null {
    return this.parser || this.parserFactory.getParser(filePath);
  }
}
