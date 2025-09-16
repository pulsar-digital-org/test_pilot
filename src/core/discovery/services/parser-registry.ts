import { UnsupportedFileTypeError } from "../errors";
import type { IParser } from "../parsers/typescript-parser";
import { TypeScriptParser } from "../parsers/typescript-parser";
import type { DiscoveryOptions } from "../types/core";

export class ParserRegistry {
	private parsers: Map<string, IParser> = new Map();

	constructor(options: Required<DiscoveryOptions>) {
		// Register TypeScript parser for all supported extensions
		const tsParser = new TypeScriptParser(options);
		tsParser.getSupportedExtensions().forEach((ext) => {
			this.parsers.set(ext, tsParser);
		});
	}

	getParser(filePath: string): IParser {
		const extension = this.getFileExtension(filePath);
		const parser = this.parsers.get(extension);

		if (!parser) {
			throw new UnsupportedFileTypeError(filePath, extension);
		}

		return parser;
	}

	getSupportedExtensions(): readonly string[] {
		return Array.from(this.parsers.keys());
	}

	private getFileExtension(filePath: string): string {
		const parts = filePath.split(".");
		return parts.length > 1 ? `.${parts.pop()?.toLowerCase() || ""}` : "";
	}
}

