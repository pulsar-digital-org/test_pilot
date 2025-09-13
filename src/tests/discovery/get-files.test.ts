import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Discovery } from "../../core/discovery/index";

vi.mock("node:fs");
vi.mock("node:path");

describe("Discovery.getFiles()", () => {
	let discovery: Discovery;
	const mockDirectoryPath = "/mock/directory/path";

	beforeEach(() => {
		discovery = new Discovery(mockDirectoryPath);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("should return file paths when directory contains only files", async () => {
		const { readdirSync, statSync } = await import("node:fs");
		const path = await import("node:path");

		// Mock fs.readdirSync to return an array of file names
		const mockFiles = ["file1.js", "file2.ts"];
		(readdirSync as vi.Mock).mockReturnValue(mockFiles);

		// Mock fs.statSync to return appropriate stats objects
		const mockDirStats = { isDirectory: () => true, isFile: () => false };
		const mockFileStats = { isDirectory: () => false, isFile: () => true };

		(statSync as vi.Mock)
			.mockReturnValueOnce(mockDirStats) // First call - check if path is directory
			.mockReturnValueOnce(mockFileStats) // file1.js
			.mockReturnValueOnce(mockFileStats); // file2.ts

		// Mock path.join to return full paths
		(path.join as vi.Mock).mockImplementation((dir, file) => `${dir}/${file}`);

		const result = await discovery.getFiles(mockDirectoryPath);

		expect(result).toEqual([
			"/mock/directory/path/file1.js",
			"/mock/directory/path/file2.ts",
		]);
	});

	test("should skip node_modules directory", async () => {
		const { readdirSync, statSync } = await import("node:fs");

		// Mock fs.readdirSync to return an array with node_modules
		const mockDirs = ["node_modules"];
		(readdirSync as vi.Mock).mockReturnValue(mockDirs);

		// Mock fs.statSync to return appropriate stats objects
		const mockDirStats = { isDirectory: () => true, isFile: () => false };
		(statSync as vi.Mock)
			.mockReturnValueOnce(mockDirStats) // First call - check if path is directory
			.mockReturnValueOnce(mockDirStats); // node_modules directory

		const result = await discovery.getFiles(mockDirectoryPath);

		expect(result).toEqual([]);
	});

	test("should handle nested directories", async () => {
		const { readdirSync, statSync } = await import("node:fs");
		const path = await import("node:path");

		// Mock fs.readdirSync to return an array with a directory and file
		(readdirSync as vi.Mock)
			.mockReturnValueOnce(["nested"]) // First call - parent directory
			.mockReturnValueOnce(["file3.js"]); // Second call - nested directory

		// Mock fs.statSync for all the calls
		const mockDirStats = { isDirectory: () => true, isFile: () => false };
		const mockFileStats = { isDirectory: () => false, isFile: () => true };

		(statSync as vi.Mock)
			.mockReturnValueOnce(mockDirStats) // Check if initial path is directory
			.mockReturnValueOnce(mockDirStats) // 'nested' is a directory
			.mockReturnValueOnce(mockFileStats); // 'file3.js' is a file

		// Mock path.join to return full paths
		(path.join as vi.Mock).mockImplementation((dir, file) => `${dir}/${file}`);

		const result = await discovery.getFiles(mockDirectoryPath);

		expect(result).toEqual(["/mock/directory/path/nested/file3.js"]);
	});

	test("should return a single file path if the provided path is a file", async () => {
		const { statSync } = await import("node:fs");

		// Mock fs.statSync to return a file stats object
		const mockFileStats = { isDirectory: () => false, isFile: () => true };
		(statSync as vi.Mock).mockReturnValue(mockFileStats);

		const result = await discovery.getFiles("/mock/file/path.js");

		expect(result).toEqual(["/mock/file/path.js"]);
	});
});
