/**
 * Initialize command for setting up test_pilot configuration interactively
 */

import { Command } from 'commander';
import { input } from '@inquirer/prompts';
import { statSync } from 'node:fs';

export function CreateInitCommandInt(): Command {
  return new Command('init')
    .description('Initialize test_pilot configuration')
    .action(async (_options, _command) => {
      const rootDir = await input({
        message:
          'What directory is the root of the project? Input the actual path or restart from terminal in the required directory.',
        default: process.cwd(),
        validate: (value) => {
          try {
            // Check if the path exists, either a directory or a file
            const stats = statSync(value);
            return stats.isDirectory() || stats.isFile();
          } catch (err) {
            return false;
          }
        }
      });

      console.log('Project root directory set to:', rootDir);
    });
}
