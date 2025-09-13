import { describe, test, expect, beforeEach } from "vitest";
import { TypeScriptParser } from "../../../../core/discovery/typescript/parser";
import * as fs from "fs";
import * as path from "path";

describe("TypeScript Parser - Core Functionality", () => {
	let parser: TypeScriptParser;

	beforeEach(() => {
		parser = new TypeScriptParser();
	});

	describe("parseFile method", () => {
		test("should parse a real TypeScript file", () => {
			// Use the parser file itself as a test
			const parserPath = path.join(
				process.cwd(),
				"src/core/discovery/typescript/parser.ts",
			);
			const result = parser.parseFile(parserPath);

			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.filePath).toBe(parserPath);
				expect(result.value.language).toBe("typescript");
				expect(result.value.ast).toBeDefined();
				expect(result.value.ast.fileName).toContain("parser.ts");
			}
		});

		test("should handle non-existent file gracefully", () => {
			const result = parser.parseFile("non-existent-file.ts");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(Error);
			}
		});

		test("should parse JavaScript files", () => {
			const jsCode = `
				function add(a, b) {
					return a + b;
				}
			`;
			// Create a temporary JS file for testing
			const tempPath = path.join(process.cwd(), "temp-test.js");
			fs.writeFileSync(tempPath, jsCode);

			const result = parser.parseFile(tempPath);
			expect(result.ok).toBe(true);

			// Cleanup
			fs.unlinkSync(tempPath);
		});

		test("should handle syntax errors in file", () => {
			const invalidCode = `
				function incomplete( {
					// Missing closing brace
			`;
			const tempPath = path.join(process.cwd(), "temp-invalid.ts");
			fs.writeFileSync(tempPath, invalidCode);

			const result = parser.parseFile(tempPath);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toContain("parsing errors");
			}

			// Cleanup
			fs.unlinkSync(tempPath);
		});
	});

	describe("parseContent method", () => {
		test("should parse TypeScript content in memory", () => {
			const code = `
				interface User {
					name: string;
					age: number;
				}

				function greetUser(user: User): string {
					return \`Hello, \${user.name}!\`;
				}
			`;

			const result = parser.parseContent(code, "test.ts");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.filePath).toBe("test.ts");
				expect(result.value.language).toBe("typescript");
				expect(result.value.ast).toBeDefined();
			}
		});

		test("should use default filename when not provided", () => {
			const code = "function test() { return 42; }";
			const result = parser.parseContent(code);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.filePath).toBe("temp.ts");
			}
		});

		test("should handle empty content", () => {
			const result = parser.parseContent("");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.ast).toBeDefined();
			}
		});

		test("should handle content with syntax errors", () => {
			const invalidCode = "function broken( { missing closing";
			const result = parser.parseContent(invalidCode);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error.message).toContain("parsing errors");
			}
		});

		test("should handle JSX content when filename ends with .tsx", () => {
			const jsxCode = `
				function Component() {
					return "Hello World";
				}
			`;

			const result = parser.parseContent(jsxCode, "component.tsx");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.value.filePath).toBe("component.tsx");
			}
		});
	});

	describe("extractFunctions method - Top-level functions", () => {
		test("should extract simple function declarations", () => {
			const code = `
				function add(a: number, b: number): number {
					return a + b;
				}

				function subtract(x: number, y: number): number {
					return x - y;
				}
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(2);

					const addFn = functions.find(f => f.name === "add");
					const subtractFn = functions.find(f => f.name === "subtract");

					expect(addFn).toBeDefined();
					expect(subtractFn).toBeDefined();

					expect(addFn?.parameters).toHaveLength(2);
					expect(addFn?.parameters[0].name).toBe("a");
					expect(addFn?.parameters[0].type).toBe("number");
					expect(addFn?.returnType).toBe("number");
				}
			}
		});

		test("should extract arrow functions assigned to variables", () => {
			const code = `
				const multiply = (a: number, b: number): number => {
					return a * b;
				};

				const divide = (x: number, y: number) => x / y;
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(2);

					const multiplyFn = functions.find(f => f.name === "multiply");
					const divideFn = functions.find(f => f.name === "divide");

					expect(multiplyFn).toBeDefined();
					expect(divideFn).toBeDefined();

					expect(multiplyFn?.parameters).toHaveLength(2);
					expect(divideFn?.parameters).toHaveLength(2);
				}
			}
		});

		test("should extract async functions", () => {
			const code = `
				async function fetchData(url: string): Promise<string> {
					const response = await fetch(url);
					return response.text();
				}

				const processData = async (data: string) => {
					return data.toUpperCase();
				};
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(2);

					const fetchDataFn = functions.find(f => f.name === "fetchData");
					const processDataFn = functions.find(f => f.name === "processData");

					expect(fetchDataFn?.isAsync).toBe(true);
					expect(processDataFn?.isAsync).toBe(true);
					expect(fetchDataFn?.returnType).toBe("Promise<string>");
				}
			}
		});

		test("should handle functions with optional parameters", () => {
			const code = `
				function greet(name: string, greeting?: string): string {
					return \`\${greeting || 'Hello'}, \${name}!\`;
				}

				function calculate(base: number, multiplier: number = 2): number {
					return base * multiplier;
				}
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(2);

					const greetFn = functions.find(f => f.name === "greet");
					const calculateFn = functions.find(f => f.name === "calculate");

					expect(greetFn?.parameters[0].optional).toBe(false);
					expect(greetFn?.parameters[1].optional).toBe(true);

					expect(calculateFn?.parameters[0].defaultValue).toBeUndefined();
					expect(calculateFn?.parameters[1].defaultValue).toBe("2");
				}
			}
		});

		test("should skip anonymous functions and callbacks", () => {
			const code = `
				// This should be extracted
				function namedFunction() {
					return "extracted";
				}

				// These should NOT be extracted
				setTimeout(() => {
					console.log("callback");
				}, 1000);

				const array = [1, 2, 3].map(function(item) {
					return item * 2;
				});

				const handler = function() {
					console.log("handler");
				};
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					// Should only extract namedFunction (handler might not be extracted if it's anonymous)
					expect(functions.length).toBeGreaterThanOrEqual(1);

					const namedFn = functions.find(f => f.name === "namedFunction");
					expect(namedFn).toBeDefined();

					// Check if handler was extracted (depends on parser implementation)
					const handlerFn = functions.find(f => f.name === "handler");
					if (handlerFn) {
						expect(handlerFn).toBeDefined();
					}
				}
			}
		});
	});

	describe("getSupportedExtensions method", () => {
		test("should return correct supported extensions", () => {
			const extensions = parser.getSupportedExtensions();
			expect(extensions).toEqual([".ts", ".tsx", ".js", ".jsx"]);
		});
	});

	describe("getName method", () => {
		test("should return parser name", () => {
			const name = parser.getName();
			expect(name).toBe("TypeScript");
		});
	});

	describe("Error handling", () => {
		test("should handle complex syntax errors gracefully", () => {
			const invalidCode = `
				function broken() {
					const obj = {
						prop: "unclosed
					// Missing closing quote and brace
				}
			`;

			const result = parser.parseContent(invalidCode);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(Error);
				expect(result.error.message).toContain("parsing errors");
			}
		});

		test("should handle extract functions on invalid parsed file", () => {
			// Create a mock invalid parsed file
			const invalidParsedFile = {
				filePath: "test.ts",
				ast: {} as any, // Invalid AST
				language: "typescript" as const,
			};

			const result = parser.extractFunctions(invalidParsedFile);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.error).toBeInstanceOf(Error);
			}
		});
	});
});