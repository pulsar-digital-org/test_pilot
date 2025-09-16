export class DiscoveryError extends Error {
	constructor(
		message: string,
		public readonly cause?: Error,
	) {
		super(message);
		this.name = "DiscoveryError";
	}
}

export class ParseError extends DiscoveryError {
	constructor(
		message: string,
		public readonly filePath: string,
		cause?: Error,
	) {
		super(`Failed to parse ${filePath}: ${message}`, cause);
		this.name = "ParseError";
	}
}

export class FunctionExtractionError extends DiscoveryError {
	constructor(
		message: string,
		public readonly functionName: string,
		public readonly filePath: string,
		cause?: Error,
	) {
		super(
			`Failed to extract function '${functionName}' from ${filePath}: ${message}`,
			cause,
		);
		this.name = "FunctionExtractionError";
	}
}

export class UnsupportedFileTypeError extends DiscoveryError {
	constructor(
		public readonly filePath: string,
		public readonly extension: string,
	) {
		super(`Unsupported file type '${extension}' for file: ${filePath}`);
		this.name = "UnsupportedFileTypeError";
	}
}

