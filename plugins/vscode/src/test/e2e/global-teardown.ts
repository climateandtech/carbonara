import { VSCodeLauncher } from './helpers/vscode-launcher';

async function globalTeardown() {
  console.log('🧹 Global teardown: Final cleanup of VSCode processes...');
  await VSCodeLauncher.cleanupAll();
}

export default globalTeardown; 