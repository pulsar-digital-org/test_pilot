import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { AIConnector, type AIProviders } from "@core/ai";
import { CodeAnalysis, type EnhancedFunctionInfo } from "@core/analysis";
import { createContextBuilder } from "@core/context";
import { CodeDiscovery } from "@core/discovery";
import { SelfHealingTestFlow } from "@core/generation";
import { Command } from "commander";
import { interactiveFunctionDiscovery, confirmTestGeneration } from "../interactive/generate.js";

interface GenerateWithFlowOptions {
	recursive?: boolean;
	directory: string;
	model: string;
	url: string;
	apiKey?: string;
	output: string;
	provider: AIProviders;
	interactive?: boolean;
	maxAttempts: string;
	qualityThreshold: string;
	enableLlmScoring?: boolean;
	enableLlmFixing?: boolean;
}

/**
 * Self-healing test generation command using the AxFlow pattern
 */
export function createGenerateWithFlowCommand(): Command {
	return new Command("generate-flow")
		.description("Generate tests using self-healing flow with quality scoring")
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
			"./tests-flow",
		)
		.option(
			"-i, --interactive",
			"Interactive mode: discover and select functions to generate tests for",
		)
		.option(
			"--max-attempts <attempts>",
			"Maximum flow attempts per test",
			"5",
		)
		.option(
			"--quality-threshold <threshold>",
			"Quality score threshold (0-100)",
			"75",
		)
		.option(
			"--enable-llm-scoring",
			"Enable LLM-based quality scoring",
			true,
		)
		.option(
			"--enable-llm-fixing",
			"Enable LLM-based test fixing",
			true,
		)
		.action(async (options: GenerateWithFlowOptions) => {
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
					const discovery = new CodeDiscovery(options.directory);
					functions = await discovery.findFunctions();
				}

				console.log(`🎯 Using self-healing flow with quality threshold: ${options.qualityThreshold}%`);

				const aiConnector = new AIConnector({
					provider: options.provider,
					model: options.model,
					engine: {
						baseURL: options.url,
						...(options.apiKey && { apiKey: options.apiKey }),
					},
				});

				// Initialize self-healing flow
				// Use process.cwd() as project root, not the specific directory/file
				const flow = new SelfHealingTestFlow(aiConnector, {
					maxAttempts: parseInt(options.maxAttempts, 10),
					qualityThreshold: parseInt(options.qualityThreshold, 10),
					projectRoot: process.cwd(), // Always use project root, not the target directory
					enableLLMScoring: options.enableLlmScoring !== false,
					enableLLMFixing: options.enableLlmFixing !== false,
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
						);

						if (!flowResult.ok) {
							console.error(`❌ Flow failed for ${func.name}: ${flowResult.error.message}`);
							errorCount++;
							continue;
						}

						const result = flowResult.value;
						flowStats.totalAttempts += result.attempts;
						flowStats.totalTime += result.executionTime;

						if (result.qualityScore) {
							flowStats.qualityScores.push(result.qualityScore.overall);
						}

						if (result.success) {
							if (result.attempts === 1) {
								flowStats.acceptedOnFirstTry++;
							} else {
								flowStats.improvedThroughFlow++;
							}

							// Save the final test
							mkdirSync(dirname(outputPath), { recursive: true });
							writeFileSync(outputPath, result.finalTest!, "utf8");

							console.log(`   ✅ Flow completed successfully!`);
							console.log(`   📊 Quality: ${result.qualityScore?.overall || 'N/A'}/100`);
							console.log(`   🔄 Attempts: ${result.attempts}`);
							console.log(`   ⏱️  Time: ${result.executionTime}ms`);
							console.log(`   💾 Saved to: ${outputPath}`);

							// Show flow iteration summary
							console.log(`   📈 Flow iterations:`);
							result.iterations.forEach((iteration, idx) => {
								const status = iteration.executionResult?.success ? '✅' :
											   iteration.validationResult?.isValid === false ? '📋' : '❌';
								const quality = iteration.qualityScore?.overall ? `${iteration.qualityScore.overall}/100` : 'N/A';
								console.log(`      ${idx + 1}. ${status} Quality: ${quality} (${iteration.timestamp}ms)`);
							});

							successCount++;
						} else {
							console.log(`   ⚠️  Flow exhausted max attempts without reaching quality threshold`);
							console.log(`   🔄 Total attempts: ${result.attempts}`);
							console.log(`   ⏱️  Total time: ${result.executionTime}ms`);

							// Still save the best attempt
							const bestIteration = result.iterations
								.filter(i => i.generatedCode)
								.sort((a, b) => (b.qualityScore?.overall || 0) - (a.qualityScore?.overall || 0))[0];

							if (bestIteration?.generatedCode) {
								mkdirSync(dirname(outputPath), { recursive: true });
								writeFileSync(outputPath, bestIteration.generatedCode, "utf8");
								console.log(`   💾 Saved best attempt to: ${outputPath}`);
							}

							errorCount++; // Count as error since it didn't meet threshold
						}

					} catch (error) {
						console.error(
							`❌ Unexpected error processing ${func.name}: ${error instanceof Error ? error.message : String(error)}`,
						);
						errorCount++;
					}
				}

				// Summary
				console.log(`\n${"=".repeat(70)}`);
				console.log(`🧬 Self-Healing Flow Complete!`);
				console.log(`✅ Successful: ${successCount}`);
				console.log(`❌ Failed: ${errorCount}`);

				console.log(`\n📊 Flow Statistics:`);
				console.log(`   🎯 Average attempts per test: ${Math.round(flowStats.totalAttempts / functions.length * 10) / 10}`);
				console.log(`   ⏱️  Average flow time: ${Math.round(flowStats.totalTime / functions.length)}ms`);
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
