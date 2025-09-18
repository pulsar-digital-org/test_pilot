# TestPilot Module Development Guide

> Professional coding standards and architectural patterns based on the Discovery module implementation

## Overview

This guide establishes the coding standards, architectural patterns, and development practices for all TestPilot modules. The Discovery module serves as the reference implementation demonstrating professional-grade TypeScript development with robust error handling, clean separation of concerns, and comprehensive type safety.

## Architecture Principles

### 1. Modular Design Pattern

Each module follows a consistent structure:

```
src/core/{module}/
├── index.ts              # Main exports and public API
├── {module-name}.ts      # Core implementation class
├── config.ts             # Configuration constants and defaults
├── errors.ts             # Module-specific error classes
├── types/
│   └── core.ts          # Core type definitions
├── services/            # Service layer implementations
│   ├── {service-name}.ts
│   └── ...
└── {specialized}/       # Module-specific implementations
    ├── extractors/      # (for discovery)
    ├── providers/       # (for ai)
    ├── generators/      # (for generation)
    └── ...
```

### 2. Dependency Injection & Interface Segregation

**Pattern**: Define interfaces for all external dependencies and services

```typescript
// ✅ Good - Interface-based design
export interface IFileSystemService {
  findFiles(directoryPath: string, options: Required<DiscoveryOptions>): Promise<string[]>;
  isFile(path: string): boolean;
  isDirectory(path: string): boolean;
}

export class FileSystemService implements IFileSystemService {
  // Implementation
}

// ✅ Good - Constructor injection
export class CodeDiscovery {
  constructor(
    private directoryPath: string,
    private fileSystem: IFileSystemService = new FileSystemService(),
    private parserRegistry: ParserRegistry = new ParserRegistry()
  ) {}
}
```

### 3. Registry Pattern for Extensibility

**Pattern**: Use registry pattern for pluggable components

```typescript
export class ParserRegistry {
  private parsers: Map<string, IParser> = new Map();

  constructor(options: Required<DiscoveryOptions>) {
    // Register implementations
    const tsParser = new TypeScriptParser(options);
    tsParser.getSupportedExtensions().forEach((ext) => {
      this.parsers.set(ext, tsParser);
    });
  }

  getParser(filePath: string): IParser {
    const extension = this.getFileExtension(filePath);
    const parser = this.parsers.get(extension);

    if (!parser) {
      throw new UnsupportedFileTypeError(filePath, extension);
    }

    return parser;
  }
}
```

## Coding Standards

### 1. Type Safety & Definitions

#### Core Types Structure
```typescript
// types/core.ts - Comprehensive type definitions
export interface ModuleOptions {
  // Required options
  requiredField: string;
  // Optional with defaults
  optionalField?: boolean;
}

export interface ModuleInfo {
  readonly name: string;
  readonly filePath: string;
  readonly metadata: Record<string, unknown>;
}

// Use readonly for immutable data structures
export interface ParsedResult<T = unknown> {
  readonly data: T;
  readonly metadata?: Record<string, unknown>;
}
```

#### Interface Design Principles
```typescript
// ✅ Good - Specific, focused interfaces
export interface NodeExtractor<T extends ts.Node> {
  canHandle(node: ts.Node): node is T;
  extract(node: T, context: ParseContext): FunctionInfo | null;
}

// ✅ Good - Generic constraints for type safety
export abstract class BaseExtractor<T extends ts.Node> implements NodeExtractor<T> {
  abstract canHandle(node: ts.Node): node is T;
  abstract extract(node: T, context: ParseContext): FunctionInfo | null;
}
```

### 2. Error Handling Strategy

#### Hierarchical Error Classes
```typescript
// errors.ts - Domain-specific error hierarchy
export class ModuleError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "ModuleError";
  }
}

export class SpecificError extends ModuleError {
  constructor(
    message: string,
    public readonly contextInfo: string,
    public readonly filePath: string,
    cause?: Error,
  ) {
    super(`Operation failed in ${contextInfo} for ${filePath}: ${message}`, cause);
    this.name = "SpecificError";
  }
}
```

#### Error Handling Patterns
```typescript
// ✅ Good - Granular error handling
try {
  const result = await this.processFile(filePath);
  return result;
} catch (error) {
  if (error instanceof ParseError) {
    // Log and continue for recoverable errors
    console.warn(`Skipping file due to parse error: ${error.message}`);
    continue;
  }
  // Re-throw for unrecoverable errors
  throw new ModuleError(
    `Failed to process ${filePath}`,
    error instanceof Error ? error : undefined,
  );
}
```

### 3. Configuration Management

#### Constants and Defaults
```typescript
// config.ts - Centralized configuration
export const DEFAULT_MODULE_OPTIONS: Required<ModuleOptions> = {
  includePatterns: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
  excludePatterns: [
    "**/node_modules/**",
    "**/dist/**",
    "**/tests/**",
    "**/*.test.*",
  ],
  enableFeatureX: true,
  maxRetries: 3,
} as const;

export const SUPPORTED_FORMATS = [".ts", ".tsx", ".js", ".jsx"] as const;
```

### 4. Method Design & APIs

#### Fluent Interface Pattern
```typescript
// ✅ Good - Chainable configuration
export class ModuleBuilder {
  private options: Required<ModuleOptions>;

  include(patterns: string | string[]): this {
    const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
    this.options.includePatterns.push(...patternsArray);
    return this;
  }

  exclude(patterns: string | string[]): this {
    const patternsArray = Array.isArray(patterns) ? patterns : [patterns];
    this.options.excludePatterns.push(...patternsArray);
    return this;
  }

  withFeature(enabled = true): this {
    this.options.enableFeatureX = enabled;
    this.recreateInternalServices();
    return this;
  }
}
```

#### Async/Await with Proper Error Handling
```typescript
// ✅ Good - Comprehensive async implementation
async findItems(): Promise<readonly ItemInfo[]> {
  try {
    const filePaths = await this.fileSystem.findFiles(
      this.directoryPath,
      this.options,
    );
    const allItems: ItemInfo[] = [];

    for (const filePath of filePaths) {
      try {
        const processor = this.registry.getProcessor(filePath);
        const parsedFile = processor.parseFile(filePath);
        const items = processor.extractItems(parsedFile);
        allItems.push(...items);
      } catch (error) {
        if (error instanceof ParseError) {
          console.warn(`Skipping file due to parse error: ${error.message}`);
          continue;
        }
        throw error;
      }
    }

    return allItems;
  } catch (error) {
    throw new ModuleError(
      `Failed to discover items in ${this.directoryPath}`,
      error instanceof Error ? error : undefined,
    );
  }
}
```

### 5. Class Design Patterns

#### Constructor Patterns
```typescript
// ✅ Good - Dependency injection with defaults
export class ModuleService {
  private options: Required<ModuleOptions>;
  private fileSystem: IFileSystemService;
  private registry: ProcessorRegistry;

  constructor(
    private directoryPath: string,
    options: Partial<ModuleOptions> = {},
    fileSystem?: IFileSystemService,
    registry?: ProcessorRegistry,
  ) {
    this.options = { ...DEFAULT_MODULE_OPTIONS, ...options };
    this.fileSystem = fileSystem ?? new FileSystemService();
    this.registry = registry ?? new ProcessorRegistry(this.options);
  }
}
```

#### Abstract Base Classes
```typescript
// ✅ Good - Abstract base with protected utilities
export abstract class BaseProcessor<T extends ts.Node> {
  abstract canHandle(node: ts.Node): node is T;
  abstract process(node: T, context: ProcessContext): ResultInfo | null;

  protected getSourceText(sourceFile: ts.SourceFile, node: ts.Node): string {
    return node.getText(sourceFile).trim();
  }

  protected getPosition(sourceFile: ts.SourceFile, node: ts.Node): Position {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(
      node.getStart(sourceFile, false),
    );
    return { line: line + 1, column: character + 1 };
  }
}
```

## File Organization Standards

### 1. Export Strategy

#### Main Module Index
```typescript
// index.ts - Clean public API
export { ModuleService } from "./module-service";
export { DEFAULT_MODULE_OPTIONS, SUPPORTED_FORMATS } from "./config";

export type {
  ModuleError,
  SpecificError,
  AnotherError,
} from "./errors";

export type {
  ModuleOptions,
  ModuleInfo,
  ProcessResult,
  // Re-export commonly used types
} from "./types/core";
```

#### Service Exports
```typescript
// services/index.ts - Service layer exports
export { FileSystemService, type IFileSystemService } from "./file-system";
export { ProcessorRegistry } from "./processor-registry";
export { ValidationService, type IValidationService } from "./validation";
```

### 2. Import Conventions

```typescript
// ✅ Good - Organized imports
import ts from "typescript";
import path from "node:path";
import { glob } from "glob";

import { ModuleError, ProcessError } from "../errors";
import type { ModuleOptions, ProcessResult } from "../types/core";
import type { IFileSystemService } from "./file-system";

// Internal imports last
import { ValidationService } from "./validation";
import { ProcessorRegistry } from "./processor-registry";
```

## Testing Strategy

### 1. Test File Organization
```
tests/
├── unit/
│   ├── core/
│   │   ├── {module}/
│   │   │   ├── {module-service}.test.ts
│   │   │   ├── services/
│   │   │   │   └── {service}.test.ts
│   │   │   └── ...
├── integration/
│   └── {module}/
└── fixtures/
    └── {module}/
```

### 2. Test Patterns
```typescript
// ✅ Good - Comprehensive test structure
describe('ModuleService', () => {
  let moduleService: ModuleService;
  let mockFileSystem: jest.Mocked<IFileSystemService>;

  beforeEach(() => {
    mockFileSystem = {
      findFiles: jest.fn(),
      isFile: jest.fn(),
      isDirectory: jest.fn(),
    };

    moduleService = new ModuleService(
      '/test/path',
      {},
      mockFileSystem,
    );
  });

  describe('findItems', () => {
    it('should process all files successfully', async () => {
      // Arrange
      mockFileSystem.findFiles.mockResolvedValue(['/test/file1.ts']);

      // Act
      const result = await moduleService.findItems();

      // Assert
      expect(result).toHaveLength(1);
      expect(mockFileSystem.findFiles).toHaveBeenCalledWith(
        '/test/path',
        expect.objectContaining({
          includePatterns: expect.arrayContaining(['**/*.ts']),
        }),
      );
    });

    it('should handle parse errors gracefully', async () => {
      // Test error handling
    });
  });
});
```

## Documentation Standards

### 1. JSDoc Requirements

```typescript
/**
 * Analyzes source code to extract structured information
 * for intelligent test generation.
 *
 * @example
 * ```typescript
 * const analyzer = new CodeAnalyzer('/src/utils');
 * const functions = await analyzer
 *   .include('**/*.ts')
 *   .exclude('**/*.test.ts')
 *   .findFunctions();
 * ```
 */
export class CodeAnalyzer {
  /**
   * Add patterns to include in analysis
   *
   * @param patterns - Glob patterns to include
   * @returns This instance for method chaining
   */
  include(patterns: string | string[]): this {
    // Implementation
  }
}
```

### 2. README Template

Each module should include a comprehensive README:

```markdown
# {Module Name}

> Brief description of module purpose

## Features

- **Feature 1** - Description
- **Feature 2** - Description

## Usage

```typescript
import { ModuleService } from '@testpilot/core/{module}';

const service = new ModuleService('/path/to/code');
const results = await service.process();
```

## Architecture

### Core Components

- **ModuleService** - Main service class
- **ProcessorRegistry** - Extensible processor system
- **FileSystemService** - File discovery and manipulation

### Error Handling

- **ModuleError** - Base error class
- **SpecificError** - Context-specific errors

## Configuration

Available options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| includePatterns | string[] | ['**/*.ts'] | Files to include |

## Testing

```bash
npm test -- {module}
```
```

## Module-Specific Guidelines

### Analysis Module
- **Focus**: Static code analysis and metric collection
- **Patterns**: Visitor pattern for AST traversal, Strategy pattern for different analysis types
- **Key Types**: `AnalysisResult`, `CodeMetrics`, `AnalysisOptions`

### Context Module
- **Focus**: Build contextual information for AI generation
- **Patterns**: Builder pattern for context assembly, Template pattern for different contexts
- **Key Types**: `ContextInfo`, `ContextBuilder`, `TemplateData`

### Execution Module
- **Focus**: Test execution and validation
- **Patterns**: Command pattern for different executors, Observer pattern for execution monitoring
- **Key Types**: `ExecutionResult`, `TestRunner`, `ValidationReport`

### AI Module
- **Focus**: AI provider abstraction and prompt management
- **Patterns**: Strategy pattern for different providers, Factory pattern for model creation
- **Key Types**: `AIProvider`, `PromptTemplate`, `GenerationRequest`

### Config Module
- **Focus**: Configuration management and validation
- **Patterns**: Singleton for global config, Validation with schema
- **Key Types**: `Config`, `ConfigSchema`, `ConfigValidator`

### Generation Module
- **Focus**: Test code generation and output formatting
- **Patterns**: Template Method for generation pipeline, Visitor for different output formats
- **Key Types**: `GenerationResult`, `TestTemplate`, `OutputFormatter`

## Quality Checklist

Before completing any module:

- [ ] **Type Safety**: All functions have explicit return types
- [ ] **Error Handling**: Comprehensive error hierarchy with context
- [ ] **Testing**: Unit tests with >90% coverage
- [ ] **Documentation**: JSDoc for all public APIs
- [ ] **Async Patterns**: Proper Promise handling and error propagation
- [ ] **Interface Design**: Clean separation of concerns with dependency injection
- [ ] **Configuration**: Centralized config with sensible defaults
- [ ] **Extensibility**: Registry/plugin patterns where applicable
- [ ] **Performance**: Efficient algorithms with streaming where appropriate
- [ ] **Logging**: Structured logging with appropriate levels

## Anti-Patterns to Avoid

### ❌ Avoid These Patterns

```typescript
// ❌ Bad - Tight coupling
export class BadService {
  constructor() {
    this.fileSystem = new FileSystemService(); // Hard dependency
  }
}

// ❌ Bad - Generic error handling
catch (error) {
  throw new Error('Something went wrong'); // Lost context
}

// ❌ Bad - Mutable public state
export class BadState {
  public options: any = {}; // Uncontrolled mutation
}

// ❌ Bad - Mixed concerns
export class BadMixer {
  parseFile(path: string) {
    // File parsing AND business logic AND error handling
    // All in one method
  }
}
```

### ✅ Follow These Patterns

```typescript
// ✅ Good - Dependency injection
export class GoodService {
  constructor(
    private fileSystem: IFileSystemService,
    private options: Required<ServiceOptions>,
  ) {}
}

// ✅ Good - Specific error handling
catch (error) {
  throw new ParseError(
    'Failed to parse TypeScript file',
    filePath,
    error instanceof Error ? error : undefined,
  );
}

// ✅ Good - Immutable configuration
export class GoodState {
  private readonly options: Required<ServiceOptions>;

  constructor(options: Partial<ServiceOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }
}

// ✅ Good - Single responsibility
export class GoodParser {
  parseFile(path: string): ParsedFile {
    // Only file parsing logic
  }
}

export class GoodProcessor {
  processFile(parsed: ParsedFile): ProcessResult {
    // Only business logic
  }
}
```

---

*This guide should be continuously updated as patterns evolve. The Discovery module serves as the living reference implementation.*