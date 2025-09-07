/**
 * Discover functions/routes for test generation
 */

export * from './function-discovery';
export * from './typescript/parser';
export * from './function-parser-factory';
export { AbstractParser } from '../../types/discovery';

// Initialize parsers
import { ParserFactory } from './function-parser-factory';
import { TypeScriptParser } from './typescript/parser';
import { FunctionDiscovery } from './function-discovery';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DependencyAnalyzer, TypeScriptAnalysisParser, FileSystemService } from '../analysis';
import type { FunctionDependency, ImportInfo } from '../analysis/types';

const factory = ParserFactory.getInstance();
factory.registerParser(new TypeScriptParser());

// Test the discovery system
async function testDiscovery() {
  console.log('🔍 Testing Function Discovery System...\n');
  
  const discovery = new FunctionDiscovery();
  
  // Also test dependency analysis
  await testDependencyAnalysis();
  
  // Test files to analyze
  const testFiles = [
    'src/core/discovery/typescript/parser.ts',
    'src/core/discovery/function-discovery.ts',
    'src/core/discovery/function-parser-factory.ts'
  ];
  
  for (const filePath of testFiles) {
    try {
      const fullPath = join(process.cwd(), filePath);
      const content = readFileSync(fullPath, 'utf-8');
      
      console.log(`📁 Analyzing: ${filePath}`);
      console.log('─'.repeat(50));
      
      // Discover functions
      const functionsResult = discovery.discoverFunctions(filePath, content);
      
      if (functionsResult.ok) {
        console.log(`✅ Found ${functionsResult.value.length} functions:`);
        functionsResult.value.forEach((func, index) => {
          console.log(`  ${index + 1}. ${func.name}() ${func.isAsync ? '(async)' : ''} ${func.isExported ? '(exported)' : ''}`);
          console.log(`     📍 Line ${func.location.line}, ${func.parameters.length} parameters`);
          if (func.returnType) {
            console.log(`     🔄 Returns: ${func.returnType}`);
          }
          console.log(JSON.stringify(func, null, 2))
        });
      } else {
        console.log(`❌ Error: ${functionsResult.error.message}`);
      }
      
      // Discover routes
      const routesResult = discovery.discoverRoutes(filePath, content);
      
      if (routesResult.ok && routesResult.value.length > 0) {
        console.log(`\n🛣️  Found ${routesResult.value.length} routes:`);
        routesResult.value.forEach((route, index) => {
          console.log(`  ${index + 1}. ${route.method} ${route.path} → ${route.handler}`);
          if (route.middleware && route.middleware.length > 0) {
            console.log(`     🔧 Middleware: ${route.middleware.join(', ')}`);
          }
        });
      }
      
      console.log('\n');
      
    } catch (error) {
      console.log(`❌ Failed to read ${filePath}: ${error}`);
    }
  }
  
  // Test parser factory
  console.log('🏭 Testing Parser Factory:');
  console.log(`Available parsers: ${factory.getAvailableParsers().map(p => p.getName()).join(', ')}`);
  console.log(`TypeScript parser: ${factory.getParser('test.ts')?.getName() || 'Not found'}`);
  console.log(`JavaScript parser: ${factory.getParser('test.js')?.getName() || 'Not found'}`);
  console.log(`Python parser: ${factory.getParser('test.py')?.getName() || 'Not found'}`);
}

async function testDependencyAnalysis() {
  console.log('\n🔗 Testing Dependency Analysis System...\n');
  
  const parser = new TypeScriptParser();
  const analysisParser = new TypeScriptAnalysisParser();
  const fileSystem = new FileSystemService();
  const dependencyAnalyzer = new DependencyAnalyzer(parser, analysisParser, fileSystem);
  
  // Test analyzing a function with dependencies
  const testCases = [
    {
      file: 'src/core/discovery/typescript/parser.ts',
      function: 'parseFile'
    },
    {
      file: 'src/core/analysis/dependency-analyzer.ts', 
      function: 'analyzeDependencies'
    }
  ];
  
  for (const testCase of testCases) {
    try {
      const fullPath = join(process.cwd(), testCase.file);
      console.log(`🔍 Analyzing dependencies for: ${testCase.function}() in ${testCase.file}`);
      console.log('─'.repeat(60));
      
      const result = await dependencyAnalyzer.analyzeDependencies(
        fullPath,
        testCase.function,
        {
          maxDepth: 2,
          includeTypes: true,
          followImports: true
        }
      );
      
      if (result.ok) {
        const analysis = result.value;
        console.log(`✅ Analysis complete for ${analysis.rootFunction}:`);
        
        function printDependency(dep: FunctionDependency, indent = '  ') {
          console.log(`${indent}📦 ${dep.name} (depth: ${dep.depth})`);
          console.log(`${indent}   📍 Line ${dep.location.line}`);
          
          const callNames = Object.keys(dep.calls);
          if (callNames.length > 0) {
            console.log(`${indent}   📞 Calls: ${callNames.join(', ')}`);
            
            // Show one level of nested calls
            if (indent.length < 6) {
              Object.values(dep.calls).forEach((nestedDep: FunctionDependency) => {
                printDependency(nestedDep, `${indent}    `);
              });
            }
          }
          
          const typeNames = Object.keys(dep.types);
          if (typeNames.length > 0) {
            console.log(`${indent}   🏷️  Types: ${typeNames.join(', ')}`);
          }
          
          if (dep.imports.length > 0) {
            console.log(`${indent}   📥 Imports: ${dep.imports.map((imp: ImportInfo) => imp.importedName).join(', ')}`);
          }
        }
        
        Object.values(analysis.dependencies).forEach((dep: FunctionDependency) => {
          printDependency(dep);
        });
        
        if (analysis.circularDependencies.length > 0) {
          console.log(`\n⚠️  Circular dependencies detected: ${analysis.circularDependencies.join(', ')}`);
        }
        
        if (analysis.maxDepthReached) {
          console.log(`\n⚠️  Maximum analysis depth reached`);
        }
        
      } else {
        console.log(`❌ Error: ${result.error.message}`);
      }
      
      console.log('\n');
      
    } catch (error) {
      console.log(`❌ Failed to analyze ${testCase.file}:${testCase.function}: ${error}`);
    }
  }
}

// Run the test
testDiscovery().catch(console.error);