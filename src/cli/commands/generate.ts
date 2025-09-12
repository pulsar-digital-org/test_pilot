import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { AIConnector, type AIProviders, CodeValidator } from "@core/ai";
import { createContextBuilder } from "@core/context";
import { Discovery } from "@core/discovery";
import { Command } from "commander";

interface GenerateOptions {
	recursive?: boolean;
	directory: string;
	model: string;
	url: string;
	apiKey?: string;
	output: string;
	maxRetries: string;
	provider: AIProviders;
}

/**
 * This command should take the cached discovery, analysis and use the context generation for proper system prompt creation
 * then generate the tests for functions
 */
export function createGenerateCommand(): Command {
	return new Command("generate")
		.description("Generate tests for functions using AI")
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
		.action(async (options: GenerateOptions) => {
			try {
				const discovery = new Discovery(options.directory);
				const functions = await discovery.discover();

				const aiConnector = new AIConnector({
					provider: options.provider,
					model: options.model,
					engine: {
						baseURL: options.url,
						...(options.apiKey && { apiKey: options.apiKey }),
					},
				});

				// Build context for each function and generate tests
				const contextBuilder = createContextBuilder();
				const codeValidator = new CodeValidator();
				const maxRetries = parseInt(options.maxRetries, 10);

				let successCount = 0;
				let errorCount = 0;

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

						// Build prompts for single function with import information
						const promptResult = contextBuilder.buildSystemPrompt(
							[func],
							outputPath,
						);

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
								`   📊 Tokens: ${aiResult.value.usage?.prompt_tokens || "unknown"}, ${aiResult.value.usage?.completion_tokens}`,
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

						// Ensure output directory exists
						mkdirSync(dirname(outputPath), { recursive: true });

						// Write validated test file
						writeFileSync(outputPath, validCode, "utf8");
						console.log(`   💾 Saved validated test to: ${outputPath}`);

						// Log code preview
						console.log(`   🔍 Generated Code Preview:`);
						const preview = validCode.substring(0, 200);
						console.log(`   ${preview}${validCode.length > 200 ? "..." : ""}`);

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
