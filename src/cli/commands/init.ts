/**
 * Initialize command for setting up test_pilot configuration
 */

import { CodeAnalysis } from "@core/analysis";
import { CodeDiscovery } from "@core/discovery";
import { welcomeMessage } from "cli/utils";
import { Command } from "commander";

export function createInitCommand(): Command {
	return new Command("init")
		.description("Initialize test_pilot configuration")
		.option("-d, --dir <DIR>", "root directory", process.cwd())
		.action(async (options, _command) => {
			welcomeMessage();

			const rootDir = options.dir;

			// if it is the root of the project, we can discover files
			const discovery = new CodeDiscovery(rootDir)
				.include("**/*.ts")
				.exclude("**/*.test.ts")
				.exclude("**/node_modules/**")
				.withClassMethods()
				.withArrowFunctions();
			const functions = await discovery.findFunctions();

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
		});
}
