import type { DiscoveryOptions } from "./types/core";

export const DEFAULT_DISCOVERY_OPTIONS: Required<DiscoveryOptions> = {
	includePatterns: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
	excludePatterns: [
		"**/node_modules/**",
		"**/.git/**",
		"**/dist/**",
		"**/build/**",
		"**/tests/**",
		"**/test/**",
		"**/*.test.*",
		"**/*.spec.*",
	],
	includePrivateMethods: false,
	includeAnonymousFunctions: false,
	includeArrowFunctions: true,
	includeClassMethods: true,
} as const;

export const SUPPORTED_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"] as const;

