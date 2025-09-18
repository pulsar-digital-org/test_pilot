import inquirer from "inquirer";
import { CodeDiscovery } from "@core/discovery";
import type { FunctionInfo } from "@core/discovery";

export interface FunctionChoice {
	name: string;
	value: FunctionInfo;
	short: string;
}

export async function interactiveFunctionDiscovery(
	directoryPath: string,
): Promise<FunctionInfo[]> {
	console.log(
		`=
 Discovering functions in: ${directoryPath}`,
	);

	const discovery = new CodeDiscovery(directoryPath);
	const functions = await discovery.findFunctions();

	if (functions.length === 0) {
		console.log("L No functions found in the specified directory.");
		return [];
	}

	console.log(`� Found ${functions.length} function(s)`);

	const choices: FunctionChoice[] = functions.map((func) => ({
		name: `${func.name} (${func.filePath}) ${func.isAsync ? "[async]" : ""}${func.parameters.length > 0 ? ` - ${func.parameters.length} params` : ""}`,
		value: func,
		short: func.name,
	}));

	const { selectedFunctions } = await inquirer.prompt([
		{
			type: "checkbox",
			name: "selectedFunctions",
			message: "Select functions to generate tests for:",
			choices: choices,
			validate: (input: FunctionInfo[]) => {
				if (input.length === 0) {
					return "Please select at least one function.";
				}
				return true;
			},
		},
	]);

	console.log(
		`=� Selected ${selectedFunctions.length} function(s) for test generation`,
	);

	return selectedFunctions;
}

export async function confirmTestGeneration(
	functions: FunctionInfo[],
): Promise<boolean> {
	const functionNames = functions.map((f) => f.name).join(", ");

	const { confirm } = await inquirer.prompt([
		{
			type: "confirm",
			name: "confirm",
			message: `Generate tests for: ${functionNames}?`,
			default: true,
		},
	]);

	return confirm;
}
