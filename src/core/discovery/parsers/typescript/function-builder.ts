import type { ClassInfo, FunctionInfo, ParameterInfo } from "../../types/core";

export class FunctionInfoBuilder {
	private info: Partial<FunctionInfo> = {};

	withName(name: string): this {
		this.info.name = name;
		return this;
	}

	withFilePath(filePath: string): this {
		this.info.filePath = filePath;
		return this;
	}

	withImplementation(implementation: string): this {
		this.info.implementation = implementation;
		return this;
	}

	withParameters(parameters: readonly ParameterInfo[]): this {
		this.info.parameters = parameters;
		return this;
	}

	withReturnType(returnType: string | undefined): this {
		this.info.returnType = returnType;
		return this;
	}

	withAsync(isAsync: boolean): this {
		this.info.isAsync = isAsync;
		return this;
	}

	withJsDoc(jsDoc: string | undefined): this {
		this.info.jsDoc = jsDoc;
		return this;
	}

	withClassContext(classContext: ClassInfo): this {
		this.info.classContext = classContext;
		return this;
	}

	build(): FunctionInfo {
		if (
			!this.info.name ||
			!this.info.filePath ||
			!this.info.implementation ||
			!this.info.parameters ||
			this.info.isAsync === undefined
		) {
			throw new Error("Missing required fields for FunctionInfo");
		}

		return this.info as FunctionInfo;
	}

	reset(): this {
		this.info = {};
		return this;
	}
}

