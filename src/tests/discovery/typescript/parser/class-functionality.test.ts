import { describe, test, expect, beforeEach } from "vitest";
import { TypeScriptParser } from "../../../../core/discovery/typescript/parser";

describe("TypeScript Parser - Class Functionality", () => {
	let parser: TypeScriptParser;

	beforeEach(() => {
		parser = new TypeScriptParser();
	});

	describe("Class method extraction", () => {
		test("should extract public methods from classes", () => {
			const code = `
				class Calculator {
					constructor(private initialValue: number = 0) {}

					public add(value: number): number {
						return this.initialValue + value;
					}

					subtract(value: number): number {
						return this.initialValue - value;
					}

					private helper(): void {
						// Should NOT be extracted
					}

					protected protectedMethod(): string {
						// Should be extracted (not private)
						return "protected";
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
					// Should extract: add, subtract, protectedMethod (but NOT helper)
					expect(functions).toHaveLength(3);

					const addMethod = functions.find(f => f.name === "Calculator.add");
					const subtractMethod = functions.find(f => f.name === "Calculator.subtract");
					const protectedMethod = functions.find(f => f.name === "Calculator.protectedMethod");
					const helperMethod = functions.find(f => f.name === "Calculator.helper");

					expect(addMethod).toBeDefined();
					expect(subtractMethod).toBeDefined();
					expect(protectedMethod).toBeDefined();
					expect(helperMethod).toBeUndefined(); // Should not extract private methods

					// Check class context is included
					expect(addMethod).toHaveProperty("classContext");
					expect((addMethod as any).classContext.name).toBe("Calculator");
				}
			}
		});

		test("should extract static methods", () => {
			const code = `
				class MathUtils {
					static PI = 3.14159;

					static square(value: number): number {
						return value * value;
					}

					static async fetchConstant(name: string): Promise<number> {
						// Async static method
						return 42;
					}

					instanceMethod(): void {
						// Regular instance method
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

					const squareMethod = functions.find(f => f.name === "MathUtils.square");
					const fetchMethod = functions.find(f => f.name === "MathUtils.fetchConstant");
					const instanceMethod = functions.find(f => f.name === "MathUtils.instanceMethod");

					expect(squareMethod).toBeDefined();
					expect(fetchMethod).toBeDefined();
					expect(instanceMethod).toBeDefined();

					expect(fetchMethod?.isAsync).toBe(true);
					expect(fetchMethod?.returnType).toBe("Promise<number>");
				}
			}
		});

		test("should skip methods starting with underscore (private convention)", () => {
			const code = `
				class Service {
					publicMethod(): string {
						return "public";
					}

					_privateConvention(): string {
						// Should NOT be extracted (starts with underscore)
						return "private";
					}

					__internalMethod(): void {
						// Should NOT be extracted (starts with double underscore)
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
					// Should only extract publicMethod
					expect(functions).toHaveLength(1);

					const publicMethod = functions.find(f => f.name === "Service.publicMethod");
					const privateMethod = functions.find(f => f.name === "Service._privateConvention");
					const internalMethod = functions.find(f => f.name === "Service.__internalMethod");

					expect(publicMethod).toBeDefined();
					expect(privateMethod).toBeUndefined();
					expect(internalMethod).toBeUndefined();
				}
			}
		});
	});

	describe("Class inheritance", () => {
		test("should extract class info with inheritance from parent class", () => {
			const code = `
				class Animal {
					name: string;

					constructor(name: string) {
						this.name = name;
					}

					speak(): string {
						return "Some sound";
					}

					protected move(): void {
						// Protected method in parent
					}
				}

				class Dog extends Animal {
					breed: string;

					constructor(name: string, breed: string) {
						super(name);
						this.breed = breed;
					}

					speak(): string {
						return "Woof!";
					}

					fetch(): void {
						// Dog-specific method
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

					// Should extract: Animal.speak, Animal.move, Dog.speak, Dog.fetch
					expect(functions.length).toBeGreaterThanOrEqual(4);

					const dogSpeakMethod = functions.find(f => f.name === "Dog.speak");
					const dogFetchMethod = functions.find(f => f.name === "Dog.fetch");
					const animalSpeakMethod = functions.find(f => f.name === "Animal.speak");

					expect(dogSpeakMethod).toBeDefined();
					expect(dogFetchMethod).toBeDefined();
					expect(animalSpeakMethod).toBeDefined();

					// Check that Dog methods have class context with inheritance info
					expect(dogSpeakMethod).toHaveProperty("classContext");
					const dogClassContext = (dogSpeakMethod as any).classContext;
					expect(dogClassContext.name).toBe("Dog");

					// Should have inherited properties/methods from Animal
					expect(dogClassContext.properties.length).toBeGreaterThan(0);
					expect(dogClassContext.methods.length).toBeGreaterThan(0);
				}
			}
		});

		test("should handle multiple levels of inheritance", () => {
			const code = `
				class Vehicle {
					wheels: number;

					start(): void {
						// Base vehicle method
					}
				}

				class Car extends Vehicle {
					doors: number;

					openDoor(): void {
						// Car method
					}
				}

				class SportsCar extends Car {
					turbocharged: boolean;

					boost(): void {
						// Sports car method
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

					const sportsCarBoost = functions.find(f => f.name === "SportsCar.boost");
					expect(sportsCarBoost).toBeDefined();

					// Should have class context with full inheritance chain
					expect(sportsCarBoost).toHaveProperty("classContext");
					const sportsCarContext = (sportsCarBoost as any).classContext;
					expect(sportsCarContext.name).toBe("SportsCar");

					// Should include properties and methods from all parent classes
					expect(sportsCarContext.properties.length).toBeGreaterThan(0);
					expect(sportsCarContext.methods.length).toBeGreaterThan(0);
				}
			}
		});
	});

	describe("Class properties extraction", () => {
		test("should extract class property information", () => {
			const code = `
				class DataModel {
					public name: string;
					private id: number;
					protected status: boolean;
					static readonly VERSION = "1.0.0";
					static instance: DataModel | null = null;

					constructor(name: string) {
						this.name = name;
					}

					getName(): string {
						return this.name;
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
					const getNameMethod = functions.find(f => f.name === "DataModel.getName");

					expect(getNameMethod).toBeDefined();
					expect(getNameMethod).toHaveProperty("classContext");

					const classContext = (getNameMethod as any).classContext;
					expect(classContext.name).toBe("DataModel");
					expect(classContext.properties).toHaveLength(5);

					// Check property details
					const nameProperty = classContext.properties.find((p: any) => p.name === "name");
					const idProperty = classContext.properties.find((p: any) => p.name === "id");
					const versionProperty = classContext.properties.find((p: any) => p.name === "VERSION");

					expect(nameProperty?.type).toBe("string");
					expect(nameProperty?.isPrivate).toBe(false);

					expect(idProperty?.type).toBe("number");
					expect(idProperty?.isPrivate).toBe(true);

					expect(versionProperty?.isStatic).toBe(true);
					expect(versionProperty?.isReadonly).toBe(true);
				}
			}
		});
	});

	describe("Class method signatures", () => {
		test("should extract detailed method signature information", () => {
			const code = `
				class ApiClient {
					private baseUrl: string;

					/**
					 * Fetches data from the API
					 * @param endpoint The API endpoint
					 * @param options Request options
					 */
					async get<T>(endpoint: string, options?: RequestInit): Promise<T> {
						const response = await fetch(\`\${this.baseUrl}/\${endpoint}\`, options);
						return response.json();
					}

					static create(baseUrl: string): ApiClient {
						return new ApiClient(baseUrl);
					}

					private parseResponse(response: Response): any {
						// Private method - should not be extracted
						return response.json();
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

					const getMethod = functions.find(f => f.name === "ApiClient.get");
					const createMethod = functions.find(f => f.name === "ApiClient.create");
					const parseMethod = functions.find(f => f.name === "ApiClient.parseResponse");

					expect(getMethod).toBeDefined();
					expect(createMethod).toBeDefined();
					expect(parseMethod).toBeUndefined(); // Private method should not be extracted

					// Check get method details
					expect(getMethod?.isAsync).toBe(true);
					expect(getMethod?.parameters).toHaveLength(2);
					expect(getMethod?.parameters[0].name).toBe("endpoint");
					expect(getMethod?.parameters[0].type).toBe("string");
					expect(getMethod?.parameters[1].optional).toBe(true);
					expect(getMethod?.returnType).toBe("Promise<T>");
					expect(getMethod?.jsDoc).toContain("Fetches data from the API");

					// Check static method
					expect(createMethod?.returnType).toBe("ApiClient");
					expect(createMethod?.parameters).toHaveLength(1);

					// Check class context includes method information
					expect(getMethod).toHaveProperty("classContext");
					const classContext = (getMethod as any).classContext;
					expect(classContext.methods.length).toBeGreaterThan(0);

					const methodInfo = classContext.methods.find((m: any) => m.name === "get");
					expect(methodInfo).toBeDefined();
					expect(methodInfo?.isAsync).toBe(true);
					expect(methodInfo?.parameters).toHaveLength(2);
				}
			}
		});
	});

	describe("Abstract classes and interfaces", () => {
		test("should handle abstract classes", () => {
			const code = `
				abstract class Shape {
					abstract area(): number;
					abstract perimeter(): number;

					describe(): string {
						return \`Area: \${this.area()}, Perimeter: \${this.perimeter()}\`;
					}
				}

				class Rectangle extends Shape {
					constructor(private width: number, private height: number) {
						super();
					}

					area(): number {
						return this.width * this.height;
					}

					perimeter(): number {
						return 2 * (this.width + this.height);
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

					// Should extract methods from both abstract and concrete classes
					const shapeDescribe = functions.find(f => f.name === "Shape.describe");
					const rectangleArea = functions.find(f => f.name === "Rectangle.area");
					const rectanglePerimeter = functions.find(f => f.name === "Rectangle.perimeter");

					expect(shapeDescribe).toBeDefined();
					expect(rectangleArea).toBeDefined();
					expect(rectanglePerimeter).toBeDefined();

					// Check inheritance information
					expect(rectangleArea).toHaveProperty("classContext");
					const rectangleContext = (rectangleArea as any).classContext;
					expect(rectangleContext.name).toBe("Rectangle");
				}
			}
		});
	});
});