import { VSCodeLauncher } from './helpers/vscode-launcher';

async function globalSetup() {
  console.log('🧹 Global setup: Cleaning up any existing VSCode processes...');
  await VSCodeLauncher.cleanupAll();
}

export default globalSetup; 