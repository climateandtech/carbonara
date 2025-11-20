"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_launcher_1 = require("./helpers/vscode-launcher");
async function globalSetup() {
    console.log('🧹 Global setup: Cleaning up any existing VSCode processes...');
    await vscode_launcher_1.VSCodeLauncher.cleanupAll();
}
exports.default = globalSetup;
//# sourceMappingURL=global-setup.js.map