#!/usr/bin/env node

import { Command } from "commander";
import packageJson from "../../package.json";
import { createDiscoverCommand } from "./commands/discover";
import { createGenerateCommand } from "./commands/generate";
import { createGenerateWithExecutionCommand } from "./commands/generate-with-execution";
import { createGenerateWithFlowCommand } from "./commands/generate-self-healing";
import { createInitCommand } from "./commands/init";

const program = new Command();

program
	.name("testpilot")
	.description("AI-powered test generation tool")
	.version(packageJson.version);

// Register commands
program.addCommand(createInitCommand());
program.addCommand(createDiscoverCommand());
// program.addCommand(createAnalyzeCommand());
program.addCommand(createGenerateCommand());
program.addCommand(createGenerateWithExecutionCommand());
program.addCommand(createGenerateWithFlowCommand());

// Parse command line arguments
program.parse();

