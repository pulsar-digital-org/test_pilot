#!/usr/bin/env node

import { Command } from 'commander';
import { createInitCommand } from './commands/init';
import { createGenerateCommand } from './commands/generate';
import packageJson from '../../package.json';
import { createDiscoverCommand } from './commands/discover';

const program = new Command();

program
  .name('testpilot')
  .description('AI-powered test generation tool')
  .version(packageJson.version);

// Register commands
program.addCommand(createInitCommand());
program.addCommand(createDiscoverCommand());
// program.addCommand(createAnalyzeCommand());
program.addCommand(createGenerateCommand());

// Parse command line arguments
program.parse();