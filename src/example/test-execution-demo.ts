import { runExecutionDemo } from "./test-execution-example";

/**
 * Simple demo runner to test the execution engine
 */
async function main(): Promise<void> {
	try {
		await runExecutionDemo();
	} catch (error) {
		console.error("Demo failed:", error);
		process.exit(1);
	}
}

// Run if called directly
if (require.main === module) {
	main();
}