/**
 * Discover functions/routes for test generation
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { ParserFactory } from "./function-parser-factory";

export { AbstractParser } from "../../types/discovery";
export * from "./function-parser-factory";
export * from "./typescript/parser";

/**
 * This is the main discovery class that gets directory and discovers file paths that are then passed to the function/route parsers appropriate for the file extension
 */
export class Discovery {
	private readonly parserFactory: ParserFactory;
	public filePaths: string[] = [];

	constructor(private readonly directoryPath: string) {
		this.parserFactory = ParserFactory.getInstance();
	}

	/**
	 * Process files via parser
	 */
	async discover() {
		if (this.filePaths.length <= 0) {
			this.filePaths = await this.getFiles();
		}

		const extractedFunctions = [];

		for (const file of this.filePaths) {
			const parser = this.parserFactory.getParser(file);
			if (!parser) {
				console.warn("This file is not supported: ", file);
				continue;
			}

			const parseResult = parser.parseFile(file);
			if (!parseResult.ok) {
				console.warn("Error parsing file: ", file, parseResult.error);
				continue;
			}

			const extracted = parser.extractFunctions(parseResult.value);
			if (!extracted.ok) {
				console.warn("Error extracting functions: ", file, extracted.error);
				continue;
			}

			extractedFunctions.push(...extracted.value);
		}

		return extractedFunctions;
	}

	/**
	 * This function discovers files in the provided directory path and also updates file paths of this discovery instance
	 * Can be run before discover to see which files we will be parsing, but is not necessary since discover also runs this function if we have no files
	 *
	 * @param directoryPath path to the project directory, if not provided use the initialization directory path
	 * @returns array of file paths
	 */
	async getFiles(
		directoryPath: string = this.directoryPath,
	): Promise<string[]> {
		const allFiles: string[] = [];

		// if this path is not a dir just add the file
		if (statSync(directoryPath).isFile()) {
			this.filePaths = [directoryPath];
			return this.filePaths;
		}

		const traverseDirectory = (dir: string) => {
			const items = readdirSync(dir);

			for (const item of items) {
				const itemPath = path.join(dir, item);
				const stats = statSync(itemPath);

				if (stats.isDirectory()) {
					// Skip node_modules and other common directories to avoid
					if (
						item === "node_modules" ||
						item === ".git" ||
						item === "dist" ||
						item === "build"
					) {
						continue;
					}
					traverseDirectory(itemPath);
				} else if (stats.isFile()) {
					allFiles.push(itemPath);
				}
			}
		};

		traverseDirectory(directoryPath);
		this.filePaths = allFiles;
		return this.filePaths;
	}
}
