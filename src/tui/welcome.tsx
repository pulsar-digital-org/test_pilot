import type { ConfigOptions } from "@core/config/types/core";
import { Box, Text } from "ink";

interface WelcomeProps {
	config: ConfigOptions;
}

export const Welcome = ({ config }: WelcomeProps) => {
	return (
		<Box flexDirection="column" borderStyle="classic">
			<Box
				flexDirection="row"
				gap={2}
				alignItems="center"
				borderStyle="classic"
				borderRight={false}
				borderTop={false}
				borderLeft={false}
				paddingX={2}
			>
				<Box flexDirection="column">
					<Text>{` ,_,`}</Text>
					<Text>{`(o o)`}</Text>
					<Text>{`( - )`}</Text>
					<Text>{` " "`}</Text>
				</Box>
				<Box flexDirection="column">
					<Text>TEST PILOT — AI test generator</Text>
					<Text>“Understands your code. Writes real tests.”</Text>
				</Box>
			</Box>
			<Box paddingX={2} flexDirection="column">
				<Text>Config</Text>
				<Box flexDirection="row" paddingX={2} gap={2}>
					<Box flexDirection="column">
						<Text>Project:</Text>
						<Text>Config:</Text>
						<Text>Working:</Text>
					</Box>
					<Box flexDirection="column">
						<Text>{config.config.projectDir}</Text>
						<Text>{config.config.configDir}</Text>
						<Text>{config.config.workingDir}</Text>
					</Box>
				</Box>
			</Box>
			{config.ai ? (
				<Box paddingX={2} marginTop={1} flexDirection="column">
					<Text>AI</Text>
					<Box marginLeft={1} flexDirection="row" gap={2}>
						<Box flexDirection="column">
							<Text>Model:</Text>
							<Text>Provider:</Text>
						</Box>
						<Box flexDirection="column">
							<Text>{config.ai?.model}</Text>
							<Text>{config.ai?.provider}</Text>
						</Box>
					</Box>
				</Box>
			) : (
				<Box paddingX={2} marginTop={1}>
					<Text dimColor>No AI configuration</Text>
				</Box>
			)}
		</Box>
	);
};
