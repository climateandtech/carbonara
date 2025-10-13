import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
	try {
		// The folder containing the Extension Manifest package.json
		// Passed to `--extensionDevelopmentPath`
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		// Passed to --extensionTestsPath
		const extensionTestsPath = path.resolve(__dirname, './suite/index');

		// Download VS Code, unzip it and run the integration test
		const launchArgs = [
			'--disable-extensions', // Disable other extensions
			'--disable-workspace-trust'
		];

		// Add headless mode for CI environments
		if (process.env.CI === 'true') {
			launchArgs.push(
				'--no-sandbox',
				'--disable-gpu',
				'--disable-dev-shm-usage',
				'--disable-setuid-sandbox',
				'--no-first-run',
				'--no-default-browser-check',
				'--disable-background-timer-throttling',
				'--disable-backgrounding-occluded-windows',
				'--disable-renderer-backgrounding',
				'--headless',
				'--disable-web-security',
				'--disable-features=VizDisplayCompositor',
				'--run-all-compositor-stages-before-draw',
				'--disable-ipc-flooding-protection'
			);
		}

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs
		});
	} catch (err) {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

main(); 