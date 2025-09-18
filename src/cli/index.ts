#!/usr/bin/env node

import { Command } from "commander";
import packageJson from "../../package.json";

import { createGenerateCommand } from "./commands/generate";
import { createGenerateWithFlowCommand } from "./commands/generate-self-healing";
import { createInitCommand } from "./commands/init";
import { CreateInitIntCommandInt } from "./interactive/init";

const program = new Command();

program
	.name("testpilot")
	.description("AI-powered test generation tool")
	.version(packageJson.version);

// Register commands
program.addCommand(createInitCommand());
program.addCommand(createGenerateCommand());
program.addCommand(createGenerateWithFlowCommand());

// Register interactive commands
program.addCommand(CreateInitIntCommandInt());

// Parse command line arguments
program.parse();
