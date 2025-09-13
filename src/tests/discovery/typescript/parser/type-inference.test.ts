import { describe, test, expect, beforeEach } from "vitest";
import { TypeScriptParser } from "../../../../core/discovery/typescript/parser";

describe("TypeScript Parser - Type Inference", () => {
	let parser: TypeScriptParser;

	beforeEach(() => {
		parser = new TypeScriptParser();
	});

	describe("Function return type inference", () => {
		test("should infer return types for functions without explicit annotations", () => {
			const code = `
				function addNumbers(a: number, b: number) {
					return a + b; // Should infer number
				}

				function getString() {
					return "hello"; // Should infer string
				}

				function getBoolean() {
					return true; // Should infer boolean
				}

				function getArray() {
					return [1, 2, 3]; // Should infer number[]
				}

				function getObject() {
					return { name: "test", value: 42 }; // Should infer object type
				}
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(5);

					const addNumbersFn = functions.find(f => f.name === "addNumbers");
					const getStringFn = functions.find(f => f.name === "getString");
					const getBooleanFn = functions.find(f => f.name === "getBoolean");
					const getArrayFn = functions.find(f => f.name === "getArray");
					const getObjectFn = functions.find(f => f.name === "getObject");

					expect(addNumbersFn?.returnType).toBe("number");
					expect(getStringFn?.returnType).toBe("string");
					expect(getBooleanFn?.returnType).toBe("boolean");
					expect(getArrayFn?.returnType).toBe("number[]");
					expect(getObjectFn?.returnType).toContain("name");
					expect(getObjectFn?.returnType).toContain("value");
				}
			}
		});

		test("should prefer explicit return type annotations over inference", () => {
			const code = `
				function explicitNumber(): number {
					return 42;
				}

				function explicitString(): string {
					return "hello";
				}

				function explicitGeneric<T>(value: T): T {
					return value;
				}

				function explicitUnion(): string | number {
					return Math.random() > 0.5 ? "hello" : 42;
				}
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(4);

					const explicitNumberFn = functions.find(f => f.name === "explicitNumber");
					const explicitStringFn = functions.find(f => f.name === "explicitString");
					const explicitGenericFn = functions.find(f => f.name === "explicitGeneric");
					const explicitUnionFn = functions.find(f => f.name === "explicitUnion");

					expect(explicitNumberFn?.returnType).toBe("number");
					expect(explicitStringFn?.returnType).toBe("string");
					expect(explicitGenericFn?.returnType).toBe("T");
					expect(explicitUnionFn?.returnType).toBe("string | number");
				}
			}
		});

		test("should handle complex return type inference", () => {
			const code = `
				function complexFunction() {
					const result = {
						status: "success" as const,
						data: [
							{ id: 1, name: "item1" },
							{ id: 2, name: "item2" }
						],
						metadata: {
							count: 2,
							timestamp: new Date()
						}
					};
					return result;
				}

				function conditionalReturn(flag: boolean) {
					if (flag) {
						return { type: "success", value: 42 };
					} else {
						return { type: "error", message: "failed" };
					}
				}

				async function asyncFunction() {
					return Promise.resolve("async result");
				}
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;

					const complexFn = functions.find(f => f.name === "complexFunction");
					const conditionalFn = functions.find(f => f.name === "conditionalReturn");
					const asyncFn = functions.find(f => f.name === "asyncFunction");

					expect(complexFn?.returnType).toBeDefined();
					expect(complexFn?.returnType).toContain("status");

					expect(conditionalFn?.returnType).toBeDefined();
					expect(conditionalFn?.returnType).toContain("type");

					expect(asyncFn?.returnType).toBe("Promise<string>");
					expect(asyncFn?.isAsync).toBe(true);
				}
			}
		});
	});

	describe("Parameter type inference", () => {
		test("should infer parameter types when not explicitly annotated", () => {
			const code = `
				function processItem(item = { id: 1, name: "default" }) {
					return item.id;
				}

				function handleArray(items = [1, 2, 3]) {
					return items.length;
				}

				function processCallback(callback = () => "default") {
					return callback();
				}

				const arrowFunction = (value = 42) => {
					return value * 2;
				};
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;

					const processItemFn = functions.find(f => f.name === "processItem");
					const handleArrayFn = functions.find(f => f.name === "handleArray");
					const processCallbackFn = functions.find(f => f.name === "processCallback");
					const arrowFn = functions.find(f => f.name === "arrowFunction");

					expect(processItemFn?.parameters[0].type).toBeDefined();
					expect(processItemFn?.parameters[0].defaultValue).toContain("id");

					expect(handleArrayFn?.parameters[0].type).toBeDefined();
					expect(handleArrayFn?.parameters[0].defaultValue).toBe("[1, 2, 3]");

					expect(processCallbackFn?.parameters[0].type).toBeDefined();
					expect(processCallbackFn?.parameters[0].defaultValue).toContain("=>");

					expect(arrowFn?.parameters[0].type).toBeDefined();
					expect(arrowFn?.parameters[0].defaultValue).toBe("42");
				}
			}
		});

		test("should handle destructured parameter types", () => {
			const code = `
				function processUser({ name, age }: { name: string; age: number }) {
					return \`\${name} is \${age} years old\`;
				}

				function processArray([first, second]: [string, number]) {
					return \`\${first}: \${second}\`;
				}

				function processOptional({ title = "Default", count = 0 }: { title?: string; count?: number } = {}) {
					return \`\${title}: \${count}\`;
				}
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;

					const processUserFn = functions.find(f => f.name === "processUser");
					const processArrayFn = functions.find(f => f.name === "processArray");
					const processOptionalFn = functions.find(f => f.name === "processOptional");

					expect(processUserFn?.parameters[0].type).toContain("name");
					expect(processUserFn?.parameters[0].type).toContain("string");
					expect(processUserFn?.parameters[0].type).toContain("age");
					expect(processUserFn?.parameters[0].type).toContain("number");

					expect(processArrayFn?.parameters[0].type).toContain("[string, number]");

					expect(processOptionalFn?.parameters[0].type).toBeDefined();
					expect(processOptionalFn?.parameters[0].defaultValue).toBe("{}");
				}
			}
		});
	});

	describe("Generic type handling", () => {
		test("should handle generic functions and their type parameters", () => {
			const code = `
				function identity<T>(value: T): T {
					return value;
				}

				function createArray<T>(item: T, count: number): T[] {
					return new Array(count).fill(item);
				}

				function mapArray<T, U>(items: T[], mapper: (item: T) => U): U[] {
					return items.map(mapper);
				}

				class Container<T> {
					constructor(private value: T) {}

					getValue(): T {
						return this.value;
					}

					setValue(newValue: T): void {
						this.value = newValue;
					}
				}
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;

					const identityFn = functions.find(f => f.name === "identity");
					const createArrayFn = functions.find(f => f.name === "createArray");
					const mapArrayFn = functions.find(f => f.name === "mapArray");
					const getValueFn = functions.find(f => f.name === "Container.getValue");
					const setValueFn = functions.find(f => f.name === "Container.setValue");

					expect(identityFn?.returnType).toBe("T");
					expect(identityFn?.parameters[0].type).toBe("T");

					expect(createArrayFn?.returnType).toBe("T[]");
					expect(createArrayFn?.parameters[0].type).toBe("T");
					expect(createArrayFn?.parameters[1].type).toBe("number");

					expect(mapArrayFn?.returnType).toBe("U[]");
					expect(mapArrayFn?.parameters[0].type).toBe("T[]");
					expect(mapArrayFn?.parameters[1].type).toContain("(item: T) => U");

					expect(getValueFn?.returnType).toBe("T");
					expect(setValueFn?.parameters[0].type).toBe("T");
					expect(setValueFn?.returnType).toBe("void");
				}
			}
		});
	});

	describe("Class method type inference", () => {
		test("should infer types for class methods", () => {
			const code = `
				class DataProcessor {
					private data: number[] = [];

					addItem(item: number) {
						this.data.push(item);
						return this; // Should infer DataProcessor
					}

					getItems() {
						return this.data; // Should infer number[]
					}

					processItems() {
						return this.data.map(item => item * 2); // Should infer number[]
					}

					getItemCount() {
						return this.data.length; // Should infer number
					}

					findItem(predicate: (item: number) => boolean) {
						return this.data.find(predicate); // Should infer number | undefined
					}
				}
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;

					const addItemFn = functions.find(f => f.name === "DataProcessor.addItem");
					const getItemsFn = functions.find(f => f.name === "DataProcessor.getItems");
					const processItemsFn = functions.find(f => f.name === "DataProcessor.processItems");
					const getItemCountFn = functions.find(f => f.name === "DataProcessor.getItemCount");
					const findItemFn = functions.find(f => f.name === "DataProcessor.findItem");

					expect(addItemFn?.returnType).toBe("this");
					expect(getItemsFn?.returnType).toBe("number[]");
					expect(processItemsFn?.returnType).toBe("number[]");
					expect(getItemCountFn?.returnType).toBe("number");
					expect(findItemFn?.returnType).toBe("number");

					expect(findItemFn?.parameters[0].type).toContain("(item: number) => boolean");
				}
			}
		});
	});

	describe("Edge cases and error handling", () => {
		test("should handle functions with complex control flow", () => {
			const code = `
				function complexFlow(input: string | number) {
					if (typeof input === "string") {
						return input.toUpperCase();
					} else if (typeof input === "number") {
						return input.toString();
					} else {
						throw new Error("Invalid input");
					}
				}

				function recursiveFunction(n: number): number {
					if (n <= 1) return 1;
					return n * recursiveFunction(n - 1);
				}

				function withTryCatch() {
					try {
						return JSON.parse("{}");
					} catch (error) {
						return null;
					}
				}
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;

					const complexFlowFn = functions.find(f => f.name === "complexFlow");
					const recursiveFn = functions.find(f => f.name === "recursiveFunction");
					const tryCatchFn = functions.find(f => f.name === "withTryCatch");

					expect(complexFlowFn?.returnType).toBe("string");
					expect(complexFlowFn?.parameters[0].type).toBe("string | number");

					expect(recursiveFn?.returnType).toBe("number");
					expect(recursiveFn?.parameters[0].type).toBe("number");

					expect(tryCatchFn?.returnType).toBeDefined();
				}
			}
		});

		test("should handle type inference failures gracefully", () => {
			const code = `
				function anyTypeFunction(param: any) {
					return param.someProperty.deepProperty;
				}

				function unknownTypeFunction(param: unknown) {
					return param;
				}

				function voidFunction(): void {
					console.log("side effect");
				}

				function neverFunction(): never {
					throw new Error("Always throws");
				}
			`;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;

					const anyTypeFn = functions.find(f => f.name === "anyTypeFunction");
					const unknownTypeFn = functions.find(f => f.name === "unknownTypeFunction");
					const voidFn = functions.find(f => f.name === "voidFunction");
					const neverFn = functions.find(f => f.name === "neverFunction");

					expect(anyTypeFn?.parameters[0].type).toBe("any");
					expect(unknownTypeFn?.parameters[0].type).toBe("unknown");
					expect(voidFn?.returnType).toBe("void");
					expect(neverFn?.returnType).toBe("never");

					// Type inference for return type should work even with any
					expect(anyTypeFn?.returnType).toBeDefined();
				}
			}
		});
	});
});