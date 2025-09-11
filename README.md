# TestPilot

An AI-powered test generation tool that understands your code and creates intelligent, comprehensive test suites. No more boilerplate - let AI analyze your functions and routes to generate meaningful tests with edge cases, error handling, and real-world scenarios.

## Features

🔍 **Smart Function Discovery** - Analyzes TypeScript/JavaScript files to extract functions with full signature information  
🤖 **AI-Powered Test Generation** - Uses Ollama or Mistral to generate intelligent test cases  
✅ **Agentic Validation** - Self-corrects generated tests by validating with TypeScript parser  
📦 **Framework Detection** - Auto-detects your testing framework (Vitest, Jest, Mocha)  
🎯 **Correct Imports** - Generates proper import paths for tests and testing utilities  
🔄 **Retry Logic** - Automatically retries invalid code generation with error feedback  

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

1. **🔍 Function Discovery**: Parses TypeScript/JavaScript files to extract functions with parameters, return types, and JSDoc
2. **📋 Context Building**: Creates focused prompts with function signatures, imports, and testing framework info
3. **🤖 AI Generation**: Sends prompts to AI model (Ollama/Mistral) to generate test code
4. **✅ Validation**: Uses TypeScript parser to validate generated code syntax
5. **🔄 Self-Correction**: Retries with error feedback if code is invalid
6. **💾 Save**: Writes validated test files with correct imports

## Generated Test Structure

TestPilot generates clean, well-structured tests:

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

## Configuration

TestPilot automatically detects:
- **Testing Framework** (Vitest, Jest, Mocha) from package.json
- **Import Paths** (calculates correct relative paths)
- **TypeScript/JavaScript** project type

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and guidelines.

## License

MIT - see [LICENSE](LICENSE) file.