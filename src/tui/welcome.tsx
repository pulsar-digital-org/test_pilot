import { Box, Text } from "ink";

interface WelcomeProps {
	config: {
		rootDir: string;
		configDir: string;
	};
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
			<Box flexDirection="row" paddingX={2} gap={2}>
				<Box flexDirection="column">
					<Text>Project:</Text>
					<Text>Config:</Text>
				</Box>
				<Box flexDirection="column">
					<Text>{config.rootDir}</Text>
					<Text>{config.configDir}</Text>
				</Box>
			</Box>
		</Box>
	);
};
