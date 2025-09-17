/**
 * Initialize command for setting up test_pilot configuration interactively
 */

import { stat, statSync } from "node:fs";
import { input } from "@inquirer/prompts";
import { welcomeMessage } from "cli/utils";
import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import { CodeDiscovery } from "@core/discovery";
import { CodeAnalysis } from "@core/analysis";

export function CreateInitIntCommandInt(): Command {
	return new Command("initint")
		.description("Initialize test_pilot configuration")
		.action(async (_options, _command) => {
			welcomeMessage();

			const rootDir = await input({
				message: "Root directory of the project?",
				default: process.cwd(),
				validate: (value) => {
					try {
						// Check if the path exists, either a directory or a file
						const stats = statSync(value);
						return stats.isDirectory() || stats.isFile();
					} catch (_err) {
						return false;
					}
				},
			});

			const configDir = await input({
				message: "Where do you want to save test pilots configuration files?",
				default: path.join(rootDir, ".test_pilot"),
			});

			// if the directory exists we can try to load from it
			if (fs.existsSync(configDir)) {
				// load this config
			} else {
				// if it is the root of the project, we can discover files
				const discovery = new CodeDiscovery(rootDir)
					.include("**/*.ts")
					.exclude("**/*.test.ts")
					.exclude("**/node_modules/**")
					.withClassMethods()
					.withArrowFunctions();
				const functions = await discovery.findFunctions();
				console.log(JSON.stringify(functions, null, 2));

				const analysis = new CodeAnalysis(functions)
					.withParentsAndChildren() // Enable parent/child analysis
					.withInternalFunctions() // Extract internal functions
					.withLSPDocumentation() // Optional LSP enhancement
					.withTimeout(5000); // 5 second LSP timeout

				const ff = await analysis.analyzeAll();

				// Create a displayable version without circular references
				const displayData = ff.map((func) => ({
					name: func.name,
					filePath: func.filePath.split("/").pop(), // Just filename
					startLine: func.startLine,
					analysis: func.analysis
						? {
								parentsCount: func.analysis.parents.length,
								parentNames: func.analysis.parents.map((p) => p.name),
								childrenCount: func.analysis.children.length,
								childrenNames: func.analysis.children.map((c) => c.name),
								internalFunctionsCount: func.analysis.functions.length,
								internalFunctions: func.analysis.functions.map((internal) => ({
									name: internal.name,
									line: internal.line,
									lsp: internal.lspDocumentation,
								})),
							}
						: null,
				}));

				console.log("📊 Analysis Results:");
				console.log("===================");
				console.log(JSON.stringify(displayData.slice(0, 5), null, 2)); // Show first 5 functions
				console.log(`\n... and ${ff.length - 5} more functions`);

				await analysis.dispose();

				// discover.save(configDir);
			}
		});
}
