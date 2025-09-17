import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { AIConnector, type AIProviders, CodeValidator } from "@core/ai";
import { CodeAnalysis, type EnhancedFunctionInfo } from "@core/analysis";
import { createContextBuilder } from "@core/context";
import { Discovery } from "@core/discovery";
import { TestExecutionEngine } from "@core/execution";
import { Command } from "commander";
import { interactiveFunctionDiscovery, confirmTestGeneration } from "../interactive/generate.js";

interface GenerateWithExecutionOptions {
	recursive?: boolean;
	directory: string;
	model: string;
	url: string;
	apiKey?: string;
	output: string;
	maxRetries: string;
	provider: AIProviders;
	interactive?: boolean;
	enableExecution?: boolean;
	maxExecutionAttempts: string;
	enableAutoFix?: boolean;
	skipExecution?: boolean;
}

/**
 * Enhanced generate command with test execution and iterative fixing
 */
export function createGenerateWithExecutionCommand(): Command {
	return new Command("generate-with-execution")
		.description("Generate tests with iterative execution and auto-fixing")
		.option(
			"-r, --recursive",
			"If we are dealing with a folder recursively discover all files",
		)
		.option(
			"-d, --directory <directory>",
			"Directory to discover functions in",
			".",
		)
		.option("-m, --model <model>", "AI model to use", "codellama:7b")
		.option(
			"-p, --provider <provider>",
			"AI provider (ollama, mistral)",
			"ollama",
		)
		.option("-u, --url <url>", "AI provider base URL", "http://localhost:11434")
		.option(
			"-k, --api-key <key>",
			"API key for cloud providers (required for Mistral)",
		)
		.option(
			"-o, --output <output>",
			"Output directory for generated tests",
			"./tests",
		)
		.option("--max-retries <retries>", "Maximum retries for invalid code", "3")
		.option(
			"-i, --interactive",
			"Interactive mode: discover and select functions to generate tests for",
		)
		.option(
			"--enable-execution",
			"Enable test execution and iterative fixing",
			true,
		)
		.option(
			"--max-execution-attempts <attempts>",
			"Maximum execution attempts per test",
			"3",
		)
		.option(
			"--enable-auto-fix",
			"Enable automatic fixing of common errors",
			true,
		)
		.option(
			"--skip-execution",
			"Skip test execution (generate only)",
			false,
		)
		.action(async (options: GenerateWithExecutionOptions) => {
			try {
				let functions: Awaited<ReturnType<Discovery["discover"]>>;

				if (options.interactive) {
					functions = await interactiveFunctionDiscovery(options.directory);

					if (functions.length === 0) {
						console.log("👋 No functions selected. Exiting...");
						return;
					}

					const confirmed = await confirmTestGeneration(functions);
					if (!confirmed) {
						console.log("👋 Test generation cancelled. Exiting...");
						return;
					}
				} else {
					const discovery = new Discovery(options.directory);
					functions = await discovery.discover();
				}

				const aiConnector = new AIConnector({
					provider: options.provider,
					model: options.model,
					engine: {
						baseURL: options.url,
						...(options.apiKey && { apiKey: options.apiKey }),
					},
				});

				// Initialize execution engine if enabled
				let executionEngine: TestExecutionEngine | null = null;
				if (options.enableExecution && !options.skipExecution) {
					executionEngine = new TestExecutionEngine(options.directory, {
						maxAttempts: parseInt(options.maxExecutionAttempts, 10),
						enableAutoFix: options.enableAutoFix || true,
						fixConfidenceThreshold: 0.7,
						timeoutPerAttempt: 10000,
					});
					console.log("🔧 Test execution engine initialized");
				}

				let analyzedFunctions: readonly EnhancedFunctionInfo[] = [];
				if (functions.length > 0) {
					const analysisEngine = new CodeAnalysis(functions)
						.withParentsAndChildren()
						.withInternalFunctions()
						.withLSPDocumentation();

					try {
						analyzedFunctions = await analysisEngine.analyzeFunctions(functions);
					} catch (analysisError) {
						console.warn(
							`⚠️  Analysis failed – continuing with discovery data only: ${analysisError instanceof Error ? analysisError.message : analysisError}`,
						);
					} finally {
						await analysisEngine.dispose();
					}
				}

				// Build context for each function and generate tests
				const contextBuilder = createContextBuilder({
					functions,
					analysis: analyzedFunctions,
					defaultTestDirectory: options.output,
				});
				const codeValidator = new CodeValidator();
				const maxRetries = parseInt(options.maxRetries, 10);

				let successCount = 0;
				let errorCount = 0;
				let executionStats = {
					executed: 0,
					passed: 0,
					fixed: 0,
					failed: 0,
				};

				for (let i = 0; i < functions.length; i++) {
					const func = functions[i];
					if (!func) {
						console.error(`❌ Function at index ${i} is undefined`);
						errorCount++;
						continue;
					}

					console.log(
						`\n[${i + 1}/${functions.length}] Processing: ${func.name}()`,
					);

					try {
						// Create output file path
						const testFileName = generateTestFileName(func.filePath, func.name);
						const outputPath = join(options.output, testFileName);

						// Build prompts for single function with import and analysis context
						const promptResult = contextBuilder.buildForFunction(func, {
							testFilePath: outputPath,
						});

						if (!promptResult.ok) {
							console.error(
								`❌ Failed to build context for ${func.name}: ${promptResult.error.message}`,
							);
							errorCount++;
							continue;
						}

						console.log(`   📝 Generated prompts for ${func.name}`);

						// Agentic retry loop for valid code generation
						let validCode: string | null = null;
						let currentPrompt = promptResult.value.userPrompt;
						let attempt = 1;

						while (attempt <= maxRetries && !validCode) {
							console.log(
								`   🔗 Attempt ${attempt}/${maxRetries}: Calling AI model...`,
							);

							// Generate tests with AI
							const aiResult = await aiConnector.generateTestsForFunction(
								promptResult.value.systemPrompt,
								currentPrompt,
							);

							if (!aiResult.ok) {
								console.error(
									`❌ AI generation failed for ${func.name}: ${aiResult.error.message}`,
								);
								break;
							}

							console.log(
								`   📊 Tokens: ${aiResult.value.usage?.prompt_tokens || "unknown"}, ${aiResult.value.usage?.completion_tokens || "unknown"}`,
							);

							// Extract and validate code
							const validationResult = codeValidator.extractAndValidate(
								aiResult.value.content,
							);

							if (!validationResult.ok) {
								console.error(
									`❌ Validation error: ${validationResult.error.message}`,
								);
								break;
							}

							if (validationResult.value.isValid) {
								validCode = validationResult.value.code;
								console.log(
									`   ✅ Generated valid TypeScript code on attempt ${attempt}`,
								);
							} else {
								console.log(`   !  Attempt ${attempt} produced invalid code:`);
								validationResult.value.errors.forEach((error) => {
									console.log(`      - ${error}`);
								});

								if (attempt < maxRetries) {
									console.log(`   🔄 Retrying with corrected prompt...`);
									// Generate retry prompt with error feedback
									currentPrompt = codeValidator.generateRetryPrompt(
										promptResult.value.userPrompt,
										validationResult.value.errors,
									);
								}
							}

							attempt++;
						}

						if (!validCode) {
							console.error(
								`❌ Failed to generate valid code for ${func.name} after ${maxRetries} attempts`,
							);
							errorCount++;
							continue;
						}

						// Execute test if execution engine is available
						let finalCode = validCode;
						if (executionEngine) {
							console.log(`   🧪 Executing generated test...`);

							const executionResult = await executionEngine.executeTest({
								testCode: validCode,
								fileName: testFileName,
								projectRoot: options.directory,
								context: {
									functionUnderTest: func.name,
									imports: [func.filePath],
								},
							});

							executionStats.executed++;

							if (!executionResult.ok) {
								console.error(`   ❌ Execution failed: ${executionResult.error.message}`);
								executionStats.failed++;
							} else {
								const response = executionResult.value;
								const metrics = executionEngine.getExecutionMetrics(response);

								if (response.success) {
									console.log(`   ✅ Test executed successfully!`);
									executionStats.passed++;
								} else {
									console.log(`   ⚠️  Test execution failed but may have been improved`);

									if (metrics.autoFixesApplied > 0) {
										console.log(`   🔧 Applied ${metrics.autoFixesApplied} automatic fixes`);
										executionStats.fixed++;

										// Use the potentially improved code from the last iteration
										const lastIteration = response.iterations[response.iterations.length - 1];
										finalCode = lastIteration.code;

										console.log(`   📈 Execution summary:`);
										console.log(`      - Iterations: ${metrics.totalIterations}`);
										console.log(`      - Total time: ${metrics.totalExecutionTime}ms`);
										console.log(`      - Error types: ${metrics.uniqueErrorTypes.join(", ") || "None"}`);
									} else {
										executionStats.failed++;
									}
								}

								// Show error analysis if available
								if (response.errorAnalysis && response.fixRecommendations) {
									console.log(`   📊 Error Analysis:`);
									if (response.errorAnalysis.primaryError) {
										console.log(`      Primary issue: ${response.errorAnalysis.primaryError.type} - ${response.errorAnalysis.primaryError.message}`);
									}
									if (response.fixRecommendations.length > 0) {
										console.log(`      Recommendations:`);
										response.fixRecommendations.slice(0, 3).forEach((rec, idx) => {
											console.log(`         ${idx + 1}. ${rec.description} (confidence: ${Math.round(rec.confidence * 100)}%)`);
										});
									}
								}
							}
						}

						// Ensure output directory exists
						mkdirSync(dirname(outputPath), { recursive: true });

						// Write final test file
						writeFileSync(outputPath, finalCode, "utf8");
						console.log(`   💾 Saved test to: ${outputPath}`);

						// Log code preview
						console.log(`   🔍 Generated Code Preview:`);
						const preview = finalCode.substring(0, 200);
						console.log(`   ${preview}${finalCode.length > 200 ? "..." : ""}`);

						successCount++;
					} catch (error) {
						console.error(
							`❌ Unexpected error processing ${func.name}: ${error instanceof Error ? error.message : String(error)}`,
						);
						errorCount++;
					}
				}

				// Summary
				console.log(`\n${"=".repeat(60)}`);
				console.log(`🎉 Test generation complete!`);
				console.log(`✅ Successful: ${successCount}`);
				console.log(`❌ Failed: ${errorCount}`);

				if (executionEngine && executionStats.executed > 0) {
					console.log(`\n🧪 Execution Summary:`);
					console.log(`   📊 Tests executed: ${executionStats.executed}`);
					console.log(`   ✅ Passed: ${executionStats.passed}`);
					console.log(`   🔧 Auto-fixed: ${executionStats.fixed}`);
					console.log(`   ❌ Failed: ${executionStats.failed}`);
					console.log(`   📈 Success rate: ${Math.round(((executionStats.passed + executionStats.fixed) / executionStats.executed) * 100)}%`);
				}

				console.log(`📁 Output directory: ${options.output}`);
			} catch (error) {
				console.error(
					"❌ Unexpected error:",
					error instanceof Error ? error.message : String(error),
				);
				process.exit(1);
			}
		});
}

// Helper method to generate test file names
function generateTestFileName(
	originalPath: string,
	functionName: string,
): string {
	const baseName = basename(originalPath, extname(originalPath));
	const dir = dirname(originalPath).replace(/^\.\//, "").replace(/\//g, "-");
	return `${dir ? `${dir}-` : ""}${baseName}-${functionName}.test.ts`;
}
