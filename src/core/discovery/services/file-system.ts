import { statSync } from "node:fs";
import path from "node:path";
import { glob } from "glob";
import type { DiscoveryOptions } from "../types/core";

export interface IFileSystemService {
	findFiles(
		directoryPath: string,
		options: Required<DiscoveryOptions>,
	): Promise<string[]>;
	isFile(path: string): boolean;
	isDirectory(path: string): boolean;
}

export class FileSystemService implements IFileSystemService {
	async findFiles(
		directoryPath: string,
		options: Required<DiscoveryOptions>,
	): Promise<string[]> {
		// If it's a single file, return it directly
		if (this.isFile(directoryPath)) {
			return [directoryPath];
		}

		// Use glob patterns for more sophisticated file matching
		const includePatterns = options.includePatterns.map((pattern) =>
			path.join(directoryPath, pattern),
		);

		const allFiles = new Set<string>();

		// Find files matching include patterns
		for (const pattern of includePatterns) {
			const files = await glob(pattern, {
				ignore: options.excludePatterns,
				absolute: true,
			});

			for (const file of files) {
				allFiles.add(file);
			}
		}

		return Array.from(allFiles).sort();
	}

	isFile(filePath: string): boolean {
		try {
			return statSync(filePath).isFile();
		} catch {
			return false;
		}
	}

	isDirectory(dirPath: string): boolean {
		try {
			return statSync(dirPath).isDirectory();
		} catch {
			return false;
		}
	}
}

