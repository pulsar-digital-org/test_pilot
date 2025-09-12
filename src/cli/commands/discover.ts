/**
 * Discover command, discovers functions in a directory or a file
 */

import { Discovery } from '@core/discovery';
import { createContextBuilder } from '@core/context';
import { Command } from 'commander';

export function createDiscoverCommand(): Command {
  return new Command('discover')
    .description('Discover functions in a directory or a file')
    .option('-r, --recursive', 'If we are dealing with a folder recursively discover all files')
    .option('-d, --directory <directory>', 'Directory to discover functions in', '.')
    .action(async (options) => {
      try {
        console.log(`🔍 Discovering functions in: ${options.directory}`);
        
        const discovery = new Discovery(options.directory);
        const functions = await discovery.discover();

        console.log(`✅ Found ${functions.length} functions`);

        if (functions.length === 0) {
          console.log('No functions found in the specified directory.');
          return;
        }

        // Display discovered functions summary
        console.log('\n📋 Discovered Functions:');
        functions.forEach((func, index) => {
          console.log(`${index + 1}. ${func.name}() - ${func.filePath}`);
          console.log(`   Parameters: ${func.parameters.length}`);
          console.log(`   Return Type: ${func.returnType || 'unknown'}`);
          console.log(`   Async: ${func.isAsync ? 'Yes' : 'No'}`);
          if (func.jsDoc) {
            console.log(`   Has Documentation: Yes`);
          }
          console.log('');
        });

        // Build individual context for each function
        const contextBuilder = createContextBuilder();
        
        console.log('\n🤖 Individual Function Prompts:');
        console.log('=' .repeat(80));

        functions.forEach((func, index) => {
          console.log(`\n### Function ${index + 1}: ${func.name}()`);
          console.log(`File: ${func.filePath}`);
          console.log('-'.repeat(60));

          // Generate prompt for single function
          const promptResult = contextBuilder.buildSystemPrompt([func]);

          if (!promptResult.ok) {
            console.error(`❌ Failed to build context for ${func.name}:`, promptResult.error.message);
            return;
          }

          console.log('\n**System Prompt:**');
          console.log(promptResult.value.systemPrompt);
          console.log('\n**User Prompt:**');
          console.log(promptResult.value.userPrompt);
          
          if (index < functions.length - 1) {
            console.log(`\n${'='.repeat(80)}`);
          }
        });

      } catch (error) {
        console.error('❌ Unexpected error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}