import { SUPPORTED_EXTENSIONS } from "../config";
import type { DiscoveryOptions, FunctionInfo, ParsedFile } from "../types/core";
import { TypeScriptASTParser } from "./typescript/ast-parser";
import { FunctionExtractor } from "./typescript/function-extractor";

export interface IParser {
	parseFile(filePath: string): ParsedFile;
	extractFunctions(
		parsedFile: ParsedFile,
		options?: DiscoveryOptions,
	): readonly FunctionInfo[];
	getSupportedExtensions(): readonly string[];
	getName(): string;
}

export class TypeScriptParser implements IParser {
	private astParser: TypeScriptASTParser;
	private functionExtractor: FunctionExtractor;

	constructor(options: Required<DiscoveryOptions>) {
		this.astParser = new TypeScriptASTParser();
		this.functionExtractor = new FunctionExtractor(options);
	}

	parseFile(filePath: string): ParsedFile {
		return this.astParser.parseFile(filePath);
	}

	extractFunctions(parsedFile: ParsedFile): readonly FunctionInfo[] {
		return this.functionExtractor.extractFunctions(parsedFile);
	}

	getSupportedExtensions(): readonly string[] {
		return SUPPORTED_EXTENSIONS;
	}

	getName(): string {
		return "TypeScript";
	}
}

