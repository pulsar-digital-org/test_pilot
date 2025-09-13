import { describe, test, expect, beforeEach } from "vitest";
import { TypeScriptParser } from "../../../../core/discovery/typescript/parser";

describe("TypeScript Parser - JSDoc Extraction", () => {
	let parser: TypeScriptParser;

	beforeEach(() => {
		parser = new TypeScriptParser();
	});

	describe("Function JSDoc extraction", () => {
		test("should extract JSDoc from a simple function", () => {
			const code = `
        /**
         * Adds two numbers together
         * @param a The first number
         * @param b The second number
         * @returns The sum of a and b
         */
        function add(a: number, b: number): number {
          return a + b;
        }
      `;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(1);
					expect(functions[0].jsDoc).toContain("Adds two numbers together");
					expect(functions[0].jsDoc).toContain("@param a The first number");
					expect(functions[0].jsDoc).toContain("@param b The second number");
					expect(functions[0].jsDoc).toContain("@returns The sum of a and b");
				}
			}
		});

		test("should extract JSDoc from arrow function", () => {
			const code = `
        /**
         * Multiplies two numbers
         * @param x First number
         * @param y Second number
         */
        const multiply = (x: number, y: number) => {
          return x * y;
        };
      `;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(1);
					expect(functions[0].jsDoc).toContain("Multiplies two numbers");
					expect(functions[0].jsDoc).toContain("@param x First number");
					expect(functions[0].jsDoc).toContain("@param y Second number");
				}
			}
		});

		test("should handle function without JSDoc", () => {
			const code = `
        function simpleFunction() {
          return 42;
        }
      `;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(1);
					expect(functions[0].jsDoc).toBeUndefined();
				}
			}
		});

		test("should extract JSDoc with complex formatting", () => {
			const code = `
        /**
         * A complex function that does many things
         *
         * This function performs complex calculations and returns
         * a result based on the input parameters.
         *
         * @example
         * \`\`\`typescript
         * const result = complexFunction(10, 'test');
         * console.log(result);
         * \`\`\`
         *
         * @param num - A number parameter
         * @param str - A string parameter
         * @param options - Optional configuration object
         * @param options.verbose - Whether to enable verbose logging
         * @returns A promise that resolves to the result
         * @throws {Error} When input is invalid
         * @since 1.0.0
         * @deprecated Use newComplexFunction instead
         */
        async function complexFunction(
          num: number,
          str: string,
          options?: { verbose?: boolean }
        ): Promise<string> {
          return \`\${num}-\${str}\`;
        }
      `;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(1);
					const jsDoc = functions[0].jsDoc;
					expect(jsDoc).toContain("A complex function that does many things");
					expect(jsDoc).toContain("@example");
					expect(jsDoc).toContain("@param num - A number parameter");
					expect(jsDoc).toContain("@param str - A string parameter");
					expect(jsDoc).toContain(
						"@param options - Optional configuration object",
					);
					expect(jsDoc).toContain(
						"@returns A promise that resolves to the result",
					);
					expect(jsDoc).toContain("@throws {Error} When input is invalid");
					expect(jsDoc).toContain("@since 1.0.0");
					expect(jsDoc).toContain("@deprecated Use newComplexFunction instead");
				}
			}
		});
	});

	describe("Class method JSDoc extraction", () => {
		test("should extract JSDoc from class methods", () => {
			const code = `
        class Calculator {
          /**
           * Adds two numbers
           * @param a First number
           * @param b Second number
           * @returns The sum
           */
          add(a: number, b: number): number {
            return a + b;
          }

          /**
           * Subtracts second number from first
           * @param a First number
           * @param b Second number to subtract
           * @returns The difference
           */
          subtract(a: number, b: number): number {
            return a - b;
          }

          // Method without JSDoc
          multiply(a: number, b: number): number {
            return a * b;
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
					expect(functions).toHaveLength(3);

					const addMethod = functions.find((f) => f.name === "Calculator.add");
					expect(addMethod?.jsDoc).toContain("Adds two numbers");
					expect(addMethod?.jsDoc).toContain("@param a First number");

					const subtractMethod = functions.find(
						(f) => f.name === "Calculator.subtract",
					);
					expect(subtractMethod?.jsDoc).toContain(
						"Subtracts second number from first",
					);
					expect(subtractMethod?.jsDoc).toContain("@returns The difference");

					const multiplyMethod = functions.find(
						(f) => f.name === "Calculator.multiply",
					);
					expect(multiplyMethod?.jsDoc).toBeUndefined();
				}
			}
		});

		test("should extract JSDoc from static methods", () => {
			const code = `
        class MathUtils {
          /**
           * Static method to calculate square root
           * @param value The number to calculate square root for
           * @returns The square root
           * @static
           */
          static sqrt(value: number): number {
            return Math.sqrt(value);
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
					expect(functions).toHaveLength(1);
					expect(functions[0].jsDoc).toContain(
						"Static method to calculate square root",
					);
					expect(functions[0].jsDoc).toContain("@static");
				}
			}
		});
	});

	describe("Class JSDoc extraction", () => {
		test("should extract JSDoc from classes", () => {
			const code = `
        /**
         * A simple calculator class
         * Provides basic arithmetic operations
         *
         * @example
         * \`\`\`typescript
         * const calc = new Calculator();
         * const result = calc.add(2, 3);
         * \`\`\`
         *
         * @since 1.0.0
         * @author John Doe
         */
        class Calculator {
          /**
           * Adds two numbers
           * @param a First number
           * @param b Second number
           * @returns Sum of the numbers
           */
          add(a: number, b: number): number {
            return a + b;
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
					expect(functions).toHaveLength(1);

					// Check that the method has access to class JSDoc through classContext
					const addMethod = functions[0];
					expect(addMethod.name).toBe("Calculator.add");
					expect(addMethod).toHaveProperty("classContext");

					const classContext = (addMethod as any).classContext;
					expect(classContext.jsDoc).toContain("A simple calculator class");
					expect(classContext.jsDoc).toContain(
						"Provides basic arithmetic operations",
					);
					expect(classContext.jsDoc).toContain("@example");
					expect(classContext.jsDoc).toContain("@since 1.0.0");
					expect(classContext.jsDoc).toContain("@author John Doe");
				}
			}
		});
	});

	describe("Edge cases", () => {
		test("should handle multiple JSDoc blocks", () => {
			const code = `
        /**
         * First JSDoc block
         * @param x First param
         */
        /**
         * Second JSDoc block
         * @param y Second param
         */
        function multipleJsDoc(x: number, y: number): number {
          return x + y;
        }
      `;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(1);
					expect(functions[0].jsDoc).toContain("Second JSDoc block");
				}
			}
		});

		test("should handle malformed JSDoc", () => {
			const code = `
        /**
         * This is a malformed JSDoc
         * Missing closing */
        function malformedJsDoc(): void {
          return;
        }
      `;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(1);
					// Should still extract some JSDoc even if malformed
					expect(functions[0].jsDoc).toBeDefined();
				}
			}
		});

		test("should handle JSDoc with special characters", () => {
			const code = `
        /**
         * Function with special characters: ??? ? -? =?
         * @param data Contains special chars: <>&"'
         * @returns String with ?cc?nts and ?mojis =

         */
        function specialChars(data: string): string {
          return data;
        }
      `;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(1);
					expect(functions[0].jsDoc).toContain("??? ? -? =?");
					expect(functions[0].jsDoc).toContain("<>&\"'");
					expect(functions[0].jsDoc).toContain("?cc?nts and ?mojis =");
				}
			}
		});

		test("should handle empty JSDoc", () => {
			const code = `
        /**
         */
        function emptyJsDoc(): void {
          return;
        }
      `;

			const parseResult = parser.parseContent(code);
			expect(parseResult.ok).toBe(true);

			if (parseResult.ok) {
				const functionsResult = parser.extractFunctions(parseResult.value);
				expect(functionsResult.ok).toBe(true);

				if (functionsResult.ok) {
					const functions = functionsResult.value;
					expect(functions).toHaveLength(1);
					// Empty JSDoc should still be captured but might be undefined after trimming
					expect(functions[0].jsDoc).toBeDefined();
				}
			}
		});
	});
});

