/**
 * Discover command, discovers functions in a directory or a file
 *
 * This command must be ran before we actually generate tests
 */

import { CodeDiscovery } from '@core/discovery';
import { Command } from 'commander';

export function createDiscoverCommand(): Command {
  return new Command('discover')
    .description('Discover functions in a directory or a file')
    .option(
      '-r, --recursive',
      'If we are dealing with a folder recursively discover all files'
    )
    .option(
      '-d, --directory <directory>',
      'Directory to discover functions in',
      '.'
    )
    .option(
      '-o, --root-dir <rootDir>',
      'Root directory for the whole project',
      process.cwd()
    )
    .action(async (options) => {
      try {
        const discovery = new CodeDiscovery(options.directory);
        const functions = await discovery.findFunctions();

        console.log(`\nDiscovered ${functions.length} functions:`);
        functions.forEach((fn, index) => {
          console.log(`${index + 1}. ${fn.name} (${fn.filePath})`);
        });

        // Save these found functions into our temp directory and all necessary options
      } catch (err) {
        console.error('Error discovering functions:', err);
        process.exit(1);
      }
    });
}
