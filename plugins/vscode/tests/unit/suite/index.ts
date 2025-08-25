import * as path from 'path';
import { glob } from 'glob';

export async function run(): Promise<void> {
	const testsRoot = path.resolve(__dirname, '..');

	try {
		// Import all test files to execute them
		const files = await glob('**/**.test.js', { cwd: testsRoot });
		
		for (const file of files) {
			const filePath = path.resolve(testsRoot, file);
			await import(filePath);
		}
	} catch (err) {
		console.error(err);
		throw err;
	}
} 