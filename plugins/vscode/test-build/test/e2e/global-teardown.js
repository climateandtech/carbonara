"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_launcher_1 = require("./helpers/vscode-launcher");
async function globalTeardown() {
    console.log('🧹 Global teardown: Final cleanup of VSCode processes...');
    await vscode_launcher_1.VSCodeLauncher.cleanupAll();
}
exports.default = globalTeardown;
//# sourceMappingURL=global-teardown.js.map