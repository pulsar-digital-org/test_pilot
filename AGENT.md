# AI Agent Instructions for TestPilot Development

## Your Role
You are developing TestPilot, an AI-powered test generation tool. You should write production-quality TypeScript code following enterprise standards and best practices.

## Core Principles to Follow

### 1. Type Safety First
- **NEVER** use `any` type without explicit comment justification
- Use discriminated unions for state management
- Leverage TypeScript's type inference
- Create specific types, not generic objects

```typescript
// ❌ Bad
function analyze(code: any): any { }

// ✅ Good
function analyze(code: SourceCode): AnalysisResult { }
```

### 2. Functional Programming Patterns
- Prefer pure functions
- Use immutability (readonly, const assertions)
- Leverage map/filter/reduce over loops
- Avoid side effects in core logic

```typescript
// ✅ Good
const analyzeRoutes = (routes: readonly Route[]): AnalysisResult[] =>
  routes.map(analyzeRoute).filter(isValidResult);
```

### 3. Error Handling
- Use Result<T, E> pattern for operations that can fail
- Never throw in async functions without catching
- Provide context in errors
- Use custom error classes

```typescript
// ✅ Good
class CodeAnalysisError extends Error {
  constructor(
    message: string,
    public readonly file: string,
    public readonly line: number,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'CodeAnalysisError';
  }
}
```

### 4. Dependency Injection
- Use interfaces for all external dependencies
- Inject dependencies, don't import directly in core
- Use factory functions for complex object creation

```typescript
// ✅ Good
interface FileSystem {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
}

class CodeAnalyzer {
  constructor(private readonly fs: FileSystem) {}
}
```

## Code Style Guidelines

### Naming Conventions
- **Files**: kebab-case (e.g., `code-analyzer.ts`)
- **Classes**: PascalCase (e.g., `CodeAnalyzer`)
- **Interfaces**: PascalCase with 'I' prefix for DI (e.g., `IAIProvider`)
- **Functions**: camelCase (e.g., `analyzeCode`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_DEPTH`)
- **Types**: PascalCase (e.g., `AnalysisResult`)

### File Organization
```typescript
// 1. Imports (sorted: external, internal, types)
import { readFile } from 'fs/promises';
import { analyzeCode } from './analyzer';
import type { Route } from './types';

// 2. Constants
const MAX_DEPTH = 5;

// 3. Types/Interfaces
interface AnalysisOptions {
  maxDepth?: number;
}

// 4. Main implementation
export class CodeAnalyzer {
  // Public methods first
  public async analyze(file: string): Promise<Result> {}
  
  // Private methods last
  private parseFile(content: string): AST {}
}

// 5. Helper functions
function isValidRoute(route: unknown): route is Route {}
```

### Testing Requirements
- Write tests alongside implementation
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)
- Mock external dependencies

```typescript
// code-analyzer.test.ts
describe('CodeAnalyzer', () => {
  describe('analyze', () => {
    it('should return error result when file does not exist', async () => {
      // Arrange
      const fs = createMockFileSystem();
      const analyzer = new CodeAnalyzer(fs);
      
      // Act
      const result = await analyzer.analyze('non-existent.ts');
      
      // Assert
      expect(result.isError()).toBe(true);
    });
  });
});
```

## Implementation Patterns

### 1. Builder Pattern for Complex Objects
```typescript
class TestSuiteBuilder {
  private tests: Test[] = [];
  
  addTest(test: Test): this {
    this.tests.push(test);
    return this;
  }
  
  build(): TestSuite {
    return new TestSuite(this.tests);
  }
}
```

### 2. Strategy Pattern for AI Providers
```typescript
interface IAIProvider {
  generateTests(context: CodeContext): Promise<TestSuite>;
}

class OllamaProvider implements IAIProvider {
  async generateTests(context: CodeContext): Promise<TestSuite> {
    // Implementation
  }
}
```

### 3. Chain of Responsibility for Analysis Pipeline
```typescript
abstract class AnalysisStep {
  constructor(private next?: AnalysisStep) {}
  
  async analyze(context: Context): Promise<Context> {
    const result = await this.doAnalyze(context);
    return this.next ? this.next.analyze(result) : result;
  }
  
  protected abstract doAnalyze(context: Context): Promise<Context>;
}
```

### 4. Result Pattern for Error Handling
```typescript
type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

function parseRoute(code: string): Result<Route> {
  try {
    const route = /* parsing logic */;
    return { ok: true, value: route };
  } catch (error) {
    return { ok: false, error };
  }
}
```

## Performance Considerations

### 1. Use Streams for Large Files
```typescript
import { pipeline } from 'stream/promises';

async function processLargeFile(filePath: string) {
  await pipeline(
    createReadStream(filePath),
    new Transform({ /* transform logic */ }),
    new Writable({ /* write logic */ })
  );
}
```

### 2. Implement Caching
```typescript
class CachedAnalyzer {
  private cache = new Map<string, AnalysisResult>();
  
  async analyze(file: string): Promise<AnalysisResult> {
    const cached = this.cache.get(file);
    if (cached && !this.isStale(file)) return cached;
    
    const result = await this.doAnalyze(file);
    this.cache.set(file, result);
    return result;
  }
}
```

### 3. Use Worker Threads for CPU-Intensive Tasks
```typescript
// analyzer.worker.ts
import { parentPort } from 'worker_threads';

parentPort?.on('message', async (code: string) => {
  const result = await analyzeCode(code);
  parentPort?.postMessage(result);
});
```

## Security Best Practices

1. **Validate All User Input**: Sanitize file paths, validate JSON
2. **Use Path Traversal Protection**: Never construct paths from user input
3. **Limit Resource Usage**: Set timeouts, memory limits
4. **Secure AI Prompts**: Sanitize code before sending to LLM

```typescript
function sanitizePath(userPath: string): string {
  const resolved = path.resolve(userPath);
  const cwd = process.cwd();
  
  if (!resolved.startsWith(cwd)) {
    throw new SecurityError('Path traversal detected');
  }
  
  return resolved;
}
```

## CLI Development Guidelines

### Use Commander.js Patterns
```typescript
import { Command } from 'commander';

export function createGenerateCommand(): Command {
  return new Command('generate')
    .description('Generate tests for your code')
    .option('-r, --routes <path>', 'Path to routes')
    .option('-f, --functions <path>', 'Path to functions')
    .action(async (options) => {
      await handleGenerate(options);
    });
}
```

### Interactive Mode with Inquirer
```typescript
import inquirer from 'inquirer';

async function interactiveMode(): Promise<Config> {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'target',
      message: 'What would you like to test?',
      choices: ['Routes', 'Functions', 'Both']
    },
    {
      type: 'checkbox',
      name: 'files',
      message: 'Select files to test:',
      choices: await getProjectFiles()
    }
  ]);
  
  return buildConfig(answers);
}
```

## Documentation Standards

### JSDoc for Public APIs
```typescript
/**
 * Analyzes TypeScript/JavaScript code and generates test suites
 * @param options - Configuration options for analysis
 * @returns Promise resolving to generated test suite
 * @throws {CodeAnalysisError} If code cannot be parsed
 * @example
 * ```typescript
 * const suite = await analyzer.analyze({
 *   file: './src/routes.ts',
 *   maxDepth: 5
 * });
 * ```
 */
export async function analyze(options: AnalysisOptions): Promise<TestSuite> {
  // Implementation
}
```

## Debugging and Logging

Use debug library for development:
```typescript
import debug from 'debug';

const log = debug('testpilot:analyzer');

export function analyzeRoute(route: Route): void {
  log('Analyzing route: %s', route.path);
  // Implementation
  log('Analysis complete for: %s', route.path);
}
```

## Common Pitfalls to Avoid

1. ❌ **Don't** use synchronous file operations
2. ❌ **Don't** mutate parameters
3. ❌ **Don't** use magic numbers/strings
4. ❌ **Don't** catch errors without handling
5. ❌ **Don't** use nested callbacks (use async/await)
6. ❌ **Don't** create tight coupling between modules
7. ❌ **Don't** forget to clean up resources

## Review Checklist

Before committing code, ensure:
- [ ] All functions have explicit return types
- [ ] Error cases are handled
- [ ] Code is tested (unit and integration)
- [ ] No console.log statements (use debug library)
- [ ] Dependencies are injected, not imported
- [ ] Documentation is complete
- [ ] Performance implications considered
- [ ] Security best practices followed
