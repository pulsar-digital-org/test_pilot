import { basename, dirname, extname, join } from "node:path";
import { AIConnector, type AIProviders } from "@core/ai";
import { CodeAnalysis, type EnhancedFunctionInfo } from "@core/analysis";
import { createContextBuilder } from "@core/context";
import { CodeDiscovery } from "@core/discovery";
import type { FunctionInfo } from "@core/discovery";
import { SelfHealingTestFlow } from "@core/generation";
import { Command } from "commander";
import { interactiveFunctionDiscovery, confirmTestGeneration } from "../interactive/generate";

interface GenerateOptions {
	recursive?: boolean;
	directory: string;
	model: string;
	url: string;
	apiKey?: string;
	output: string;
	maxAttempts: string;
	qualityThreshold: string;
	provider: AIProviders;
	interactive?: boolean;
}

/**
 * This command should take the cached discovery, analysis and use the context generation for proper system prompt creation
 * then generate the tests for functions
 */
export function createGenerateCommand(): Command {
	return new Command("generate")
		.description("Generate high-quality tests using self-healing AI flow")
		.option(
			"-r, --recursive",
			"If we are dealing with a folder recursively discover all files",
		)
		.option(
			"-d, --directory <directory>",
			"Directory to discover functions in",
			".",
		)
		.option("-m, --model <model>", "AI model to use", "qwen2.5-coder:7b")
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
		.option(
			"--max-attempts <attempts>",
			"Maximum generation attempts per test",
			"5",
		)
		.option(
			"--quality-threshold <threshold>",
			"Quality score threshold (0-100)",
			"75",
		)
		.option(
			"-i, --interactive",
			"Interactive mode: discover and select functions to generate tests for",
		)
		.action(async (options: GenerateOptions) => {
			try {
				console.log(`🎯 Using self-healing flow with quality threshold: ${options.qualityThreshold}%`);

				let functions: FunctionInfo[];

				if (options.interactive) {
					// Interactive mode: let user select functions
					functions = await interactiveFunctionDiscovery(options.directory);

					if (functions.length === 0) {
						console.log("No functions selected for test generation.");
						return;
					}

					// Confirm the selection
					const confirmed = await confirmTestGeneration(functions);
					if (!confirmed) {
						console.log("Test generation cancelled.");
						return;
					}
				} else {
					// Non-interactive mode: discover all functions
					const discovery = new CodeDiscovery(options.directory);
					functions = await discovery.findFunctions();

					if (functions.length === 0) {
						console.log("No functions found in the specified directory.");
						return;
					}
				}

				const aiConnector = new AIConnector({
					provider: options.provider,
					model: options.model,
					engine: {
						baseURL: options.url,
						...(options.apiKey && { apiKey: options.apiKey }),
					},
				});

				// Initialize self-healing flow
				const flow = new SelfHealingTestFlow(aiConnector, {
					maxAttempts: parseInt(options.maxAttempts, 10),
					qualityThreshold: parseInt(options.qualityThreshold, 10),
				});

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

				const contextBuilder = createContextBuilder({
					functions,
					analysis: analyzedFunctions,
					defaultTestDirectory: options.output,
				});

				let successCount = 0;
				let errorCount = 0;
				let flowStats = {
					totalAttempts: 0,
					totalTime: 0,
					qualityScores: [] as number[],
					acceptedOnFirstTry: 0,
					improvedThroughFlow: 0,
				};

				for (let i = 0; i < functions.length; i++) {
					const func = functions[i];
					if (!func) {
						console.error(`❌ Function at index ${i} is undefined`);
						errorCount++;
						continue;
					}

					console.log(
						`\n[${i + 1}/${functions.length}] 🧬 Self-healing flow for: ${func.name}()`,
					);

					try {
						// Create output file path
						const testFileName = generateTestFileName(func.filePath, func.name);
						const outputPath = join(options.output, testFileName);

						// Build context
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

						console.log(`   📝 Built context for ${func.name}`);

						// Run self-healing flow
						const flowResult = await flow.generate(
							func,
							promptResult.value.systemPrompt,
							promptResult.value.userPrompt,
							outputPath,
						);

						if (!flowResult.ok) {
							console.error(`❌ Flow failed for ${func.name}: ${flowResult.error.message}`);
							errorCount++;
							continue;
						}

						const result = flowResult.value;
						flowStats.totalAttempts += result.attempts;
						flowStats.totalTime += result.executionTime;

						const bestQuality = result.qualityScore
							? result.qualityScore.overall
							: result.iterations.reduce((best, iteration) => {
								const value = iteration.qualityScore?.overall ?? -1;
								return value > best ? value : best;
							}, -1);
						if (bestQuality >= 0) {
							flowStats.qualityScores.push(bestQuality);
						}

						if (result.success) {
							if (result.attempts === 1) {
								flowStats.acceptedOnFirstTry++;
							} else {
								flowStats.improvedThroughFlow++;
							}

							console.log(`   ✅ Flow completed successfully!`);
							console.log(`   📊 Quality: ${result.qualityScore?.overall ?? 'N/A'}/100`);
							console.log(`   🔄 Attempts: ${result.attempts}`);
							console.log(`   ⏱️  Time: ${result.executionTime}ms`);
							console.log(`   💾 Saved to: ${result.savedTo ?? outputPath}`);

							successCount++;
						} else {
							console.log(`   ⚠️  Flow exhausted max attempts without reaching the quality threshold.`);
							console.log(`   🔄 Total attempts: ${result.attempts}`);
							console.log(`   ⏱️  Total time: ${result.executionTime}ms`);
							if (result.improvement) {
								console.log("   💡 Suggested improvements:");
								result.improvement.split("\n").forEach((line) => {
									if (line.trim().length > 0) {
										console.log(`      - ${line.trim()}`);
									}
								});
							}

							errorCount++;
						}

						console.log(`   📈 Flow iterations:`);
						result.iterations.forEach((iteration, idx) => {
							const quality = iteration.qualityScore?.overall ?? "N/A";
							const validationStatus = iteration.validationResult
								? iteration.validationResult.isValid
									? "validation ✅"
									: "validation ❌"
								: "validation —";
							const executionStatus = iteration.executionResult
								? iteration.executionResult.success
									? "execution ✅"
									: "execution ❌"
								: "execution —";
							const feedback = iteration.feedback
								? ` – ${iteration.feedback.slice(0, 100)}${iteration.feedback.length > 100 ? "…" : ""}`
								: "";
							console.log(
								`      ${idx + 1}. Quality: ${quality}/100 (${iteration.timestamp}ms) [${validationStatus} | ${executionStatus}]${feedback}`,
							);
						});

					} catch (error) {
						console.error(
							`❌ Unexpected error processing ${func.name}: ${error instanceof Error ? error.message : String(error)}`,
						);
						errorCount++;
					}
				}

				// Summary
				console.log(`\n${"=".repeat(70)}`);
				console.log(`🧬 Self-Healing Test Generation Complete!`);
				console.log(`✅ Successful: ${successCount}`);
				console.log(`❌ Failed: ${errorCount}`);

				const processedCount = successCount + errorCount;
				console.log(`\n📊 Flow Statistics:`);
				if (processedCount > 0) {
					console.log(
						`   🎯 Average attempts per test: ${Math.round((flowStats.totalAttempts / processedCount) * 10) / 10}`,
					);
					console.log(
						`   ⏱️  Average flow time: ${Math.round(flowStats.totalTime / processedCount)}ms`,
					);
				} else {
					console.log("   No functions were processed.");
				}
				console.log(`   🥇 Accepted on first try: ${flowStats.acceptedOnFirstTry}`);
				console.log(`   📈 Improved through flow: ${flowStats.improvedThroughFlow}`);

				if (flowStats.qualityScores.length > 0) {
					const avgQuality = Math.round(flowStats.qualityScores.reduce((a, b) => a + b, 0) / flowStats.qualityScores.length);
					const minQuality = Math.min(...flowStats.qualityScores);
					const maxQuality = Math.max(...flowStats.qualityScores);
					console.log(`   🏆 Quality scores: ${avgQuality}/100 avg (${minQuality}-${maxQuality} range)`);
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
