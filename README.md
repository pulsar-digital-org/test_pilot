# TestPilot

An AI-powered test generation tool that understands your code and creates intelligent, comprehensive test suites. No more boilerplate - let AI analyze your functions and routes to generate meaningful tests with edge cases, error handling, and real-world scenarios.

Currently we only support typescript with possible future language agnostic implementation.

## Modules

The whole project is done in a modular system design so that it is easier to use just the parts you need, and easier to understand.

### Discovery

The Discovery module is the core engine for analyzing TypeScript and JavaScript codebases to extract detailed function and class information. Built on the official TypeScript Compiler API, it provides comprehensive static analysis capabilities for intelligent test generation.

**Key Features:**

- **Function Analysis** - Extracts function declarations, arrow functions, anonymous functions, and class methods with complete signature information including parameters, return types, JSDoc comments, and implementation details
- **Class Context Resolution** - Analyzes class structures to capture properties, methods, visibility modifiers, and inheritance relationships, providing complete interface context to prevent AI hallucination during test generation
- **Smart Pattern Matching** - Supports configurable include/exclude patterns for selective code discovery with fine-grained control over what gets analyzed
- **Multiple Function Types** - Handles function declarations, arrow functions, anonymous functions, async functions, and class methods with proper type information extraction
- **Rich Metadata Extraction** - Captures JSDoc documentation, parameter types, optional parameters, default values, return types, and source location information
- **Parser Registry System** - Extensible architecture supporting multiple language parsers with TypeScript as the primary implementation

**Technical Implementation:**

- Utilizes TypeScript Compiler API for robust AST parsing and type analysis
- Implements visitor pattern for efficient AST traversal and data extraction
- Provides fluent API for configuration with method chaining support
- Handles parse errors gracefully while continuing analysis of remaining files
- Extracts complete class interfaces while maintaining method-level granularity for targeted test generation

### Analysis

`...`

### Context

`...`

### Execution

`...`

### AI

`...`

### Config

`...`

### Generation

`...`

## Features

🔍 **Smart Function Discovery** - Analyzes TypeScript/JavaScript files to extract functions with full signature information  
🏗️ **Intelligent Class Support** - Detects class methods with complete interface context to prevent AI hallucination  
🤖 **AI-Powered Test Generation** - Uses Ollama or Mistral to generate intelligent test cases with realistic edge cases  
✅ **Agentic Validation** - Self-corrects generated tests by validating with TypeScript parser  
📦 **Framework Detection** - Auto-detects your testing framework (Vitest, Jest, Mocha)  
🎯 **Correct Imports** - Generates proper import paths for tests and testing utilities  
🔄 **Retry Logic** - Automatically retries invalid code generation with error feedback  
🧠 **Context-Aware** - Provides AI with complete class interfaces while testing individual methods  

## Quick Start

### Installation

```bash
npm install -g test-pilot
```

### Basic Usage

```bash
# Discover functions and see generated prompts
test-pilot discover -d src/utils

# Generate tests for all functions in a directory
test-pilot generate -d src/utils

# Generate with Ollama (default)
test-pilot generate -d src -m codellama:7b

# Generate with Mistral
test-pilot generate -d src -p mistral -m mistral-small -k YOUR_API_KEY
```

## Commands

### `discover`

Discover functions in your codebase and preview generated prompts.

```bash
test-pilot discover [options]

Options:
  -d, --directory <directory>  Directory to discover functions in (default: ".")
  -r, --recursive             Recursively discover all files
```

**Example:**

```bash
test-pilot discover -d src/utils -r
```

### `generate`

Generate AI-powered tests for discovered functions.

```bash
test-pilot generate [options]

Options:
  -d, --directory <directory>  Directory to discover functions in (default: ".")
  -r, --recursive             Recursively discover all files
  -p, --provider <provider>   AI provider: ollama, mistral (default: "ollama")
  -m, --model <model>         AI model to use (default: "codellama:7b")
  -k, --api-key <key>         API key for cloud providers (required for Mistral)
  -u, --url <url>             AI provider base URL (default: "http://localhost:11434")
  -o, --output <output>       Output directory for tests (default: "./tests")
  --max-retries <retries>     Maximum retries for invalid code (default: "3")
```

**Examples:**

```bash
# Generate tests with Ollama CodeLlama
test-pilot generate -d src/utils -m codellama:13b

# Generate tests with Mistral
test-pilot generate -d src -p mistral -m mistral-small -k $MISTRAL_API_KEY

# Custom output directory with retries
test-pilot generate -d src/api -o api-tests --max-retries 5

# Recursive generation with custom Ollama instance
test-pilot generate -d . -r -u http://my-server:11434 -m deepseek-coder
```

## AI Providers

### Ollama (Default)

Run models locally with [Ollama](https://ollama.ai/):

```bash
# Install Ollama and pull a code model
ollama pull codellama:7b
ollama pull deepseek-coder

# Generate tests
test-pilot generate -m codellama:7b
```

**Recommended Models:**

- `codellama:7b` - Fast, good for simple functions
- `codellama:13b` - Better quality, slower
- `deepseek-coder` - Excellent code understanding

### Mistral

Use Mistral's cloud API:

```bash
# Set your API key
export MISTRAL_API_KEY=your_key_here

# Generate tests
test-pilot generate -p mistral -m mistral-small -k $MISTRAL_API_KEY
```

**Available Models:**

- `mistral-tiny` - Fastest, cheapest
- `mistral-small` - Good balance
- `mistral-medium` - Highest quality

## How It Works

1. **🔍 Smart Discovery**: Parses TypeScript/JavaScript files to extract functions, class methods, parameters, return types, and JSDoc
2. **🏗️ Class Context Building**: For class methods, provides complete class interface (properties + method signatures) to prevent AI from hallucinating non-existent methods
3. **📋 Context Generation**: Creates focused prompts with function signatures, class context, imports, and testing framework info
4. **🤖 AI Generation**: Sends rich context to AI model (Ollama/Mistral) to generate realistic, comprehensive test code
5. **✅ Validation**: Uses TypeScript parser to validate generated code syntax
6. **🔄 Self-Correction**: Retries with error feedback if code is invalid
7. **💾 Save**: Writes validated test files with correct imports and proper setup/teardown

## Generated Test Structure

TestPilot generates clean, well-structured tests with intelligent context awareness:

### For Regular Functions

```typescript
// Auto-generated imports based on your testing framework
import { describe, test, expect } from 'vitest';
import { calculateTotal } from '../src/utils/math';

describe('calculateTotal', () => {
  test('should calculate total with default tax', () => {
    const result = calculateTotal([10, 20, 30]);
    expect(result).toBe(66);
  });

  test('should handle empty array', () => {
    const result = calculateTotal([]);
    expect(result).toBe(0);
  });

  test('should handle custom tax rate', () => {
    const result = calculateTotal([100], 0.2);
    expect(result).toBe(120);
  });
});
```

### For Class Methods (with Full Context Awareness)

```typescript
// TestPilot provides complete class interface to AI
// AI sees: class Calculator { private history: number[]; add(); subtract(); getHistory(); clearHistory(); }
// But only tests the target method with full implementation

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Calculator } from '../src/example/calculator';

describe('Calculator.add', () => {
  let calculator: Calculator;

  beforeEach(() => {
    calculator = new Calculator();
  });

  afterEach(() => {
    calculator.clearHistory(); // AI knows this method exists!
  });

  test('should add two positive numbers', () => {
    const result = calculator.add(2, 3);
    expect(result).toBe(5);
  });

  test('should add result to history', () => {
    calculator.add(2, 3);
    const history = calculator.getHistory(); // Tests class state interaction
    expect(history).toEqual([5]);
  });

  test('should handle floating point precision', () => {
    const result = calculator.add(0.1, 0.2);
    expect(result).toBeCloseTo(0.3);
  });
  
  // AI generates 29 comprehensive test cases with realistic edge cases!
});
```

## What Makes TestPilot Special

### 🎯 **Zero AI Hallucination for Classes**

Traditional AI test generators often hallucinate methods that don't exist. TestPilot solves this by providing the AI with complete class interfaces while only revealing the implementation for the method being tested.

```typescript
// AI sees the complete interface:
class Calculator {
  private history: number[];
  add(a: number, b: number): number;
  subtract(a: number, b: number): number;
  getHistory(): number[];
  clearHistory(): void;
}

// But only gets implementation for the target method
// Result: AI never invents multiply() or divide() methods!
```

### 🧠 **Context-Aware Test Generation**

- Tests class method interactions (e.g., `add()` affects `getHistory()`)
- Proper setup/teardown using actual class methods
- Realistic edge cases based on actual class structure
- Type-safe test generation with full TypeScript support

## Configuration

TestPilot automatically detects:

- **Testing Framework** (Vitest, Jest, Mocha) from package.json
- **Import Paths** (calculates correct relative paths)
- **TypeScript/JavaScript** project type
- **Class Structures** (properties, methods, visibility)

No configuration files needed!

## Requirements

- Node.js 16+
- TypeScript project (recommended)
- Testing framework installed (Vitest, Jest, or Mocha)
- AI Provider:
  - **Ollama**: Install locally for free usage
  - **Mistral**: API key required

## Troubleshooting

### Ollama Connection Issues

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# Start Ollama if not running
ollama serve
```

### Invalid Generated Code

- Increase `--max-retries` for complex functions
- Try a larger model (`codellama:13b` vs `codellama:7b`)
- Check if function signatures are too complex

### Import Path Issues

- Ensure your project structure follows standard conventions
- Check that source files are in expected locations relative to test output

### AI Generates Non-Existent Methods

This shouldn't happen with TestPilot's class context system, but if it does:

- Check that your class is properly structured with TypeScript
- Verify the class is exported correctly
- The class context system prevents AI from hallucinating methods

## Roadmap

### 🎯 Interactive CLI Experience
Transform TestPilot into an intelligent, observant coding companion:

```
┌────────────────────────────────────────────────────────────────────────────┐
│  ,_,                                                                       │
│ (o o)   TEST PILOT — AI test generator                                     │
│ ( - )   "Understands your code. Writes real tests."                        │
│  " "                                                                       │
├────────────────────────────────────────────────────────────────────────────┤
│ project:   ./                                                              │
│ language:  autodetect                                                      │
│ repo:      git main @ 4a9c3e7                                              │
│                                                                            │
│ [1] Analyze code      [2] Generate plan      [3] Run tests      [q] Quit   │
└────────────────────────────────────────────────────────────────────────────┘
```

**Planned Features:**
- **Real-time Code Analysis** - Interactive discovery with live feedback
- **Test Plan Review** - Preview and customize test strategies before generation
- **Smart Test Execution** - Integrated test running with coverage insights
- **Visual Progress** - Terminal-friendly progress bars and status updates
- **Owl Personality** - Sharp, observant insights throughout the workflow

### 🧠 Intelligent Test Analysis & Coaching

Beyond test generation - become your testing mentor:

#### **Failure Analysis**
```
(o o)  test failed: TaxService › retries on 502 with jitter
( - )  root cause: mock timer needs advanceTimersToNextTimer() twice
```

**Smart Diagnostics:**
- Parse test failures to identify root causes
- Suggest specific fixes with code patches
- Detect common testing anti-patterns
- Recommend better mocking strategies

#### **Test Quality Improvements**
```
(o o)  spotted improvement: this test could be more robust
( - )  suggestion: add edge case for currency precision (0.001 vs 0.01)
```

**Enhancement Recommendations:**
- **Coverage Gaps** - "Add test for the error path in line 42"
- **Edge Cases** - "Consider testing with empty arrays, null values"
- **Performance** - "This test could benefit from timing assertions"
- **Reliability** - "Replace flaky sleep() with proper async/await"
- **Maintainability** - "Extract this setup into a test helper"

#### **Test Refactoring Assistant**
```
(o o)  detected duplicate setup across 5 test files
( - )  suggestion: extract shared fixtures to tests/helpers/
```

**Code Quality:**
- Identify duplicate test setup code
- Suggest test helper extractions
- Recommend better assertion libraries
- Optimize slow-running tests
- Improve test naming conventions

#### **Continuous Learning**
- Learn from your codebase patterns
- Adapt suggestions to your testing style
- Remember past fixes that worked
- Suggest project-specific best practices

### 🔄 Self-Healing Test Suite

**Auto-Recovery:**
- Detect when code changes break tests
- Propose minimal test updates
- Handle import path changes automatically
- Update mocks when interfaces change

**Proactive Monitoring:**
- Watch for code changes that need new tests
- Suggest test updates for refactored functions
- Alert when test coverage drops below thresholds

### 🎨 Enhanced User Experience

**Terminal UI Improvements:**
- Syntax-highlighted code previews
- Interactive diff viewing
- Expandable/collapsible sections
- Keyboard shortcuts for power users

**Integration Features:**
- Git hooks for automatic test updates
- IDE extensions for in-editor insights
- CI/CD pipeline integration
- Team collaboration features

---

*The owl sees all, suggests wisely, and never gets in your way.* 🦉

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT - see [LICENSE](LICENSE) file.
