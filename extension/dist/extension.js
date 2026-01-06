"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const path = require("path");
const minimatch = require("minimatch");
function activate(context) {
    // Note: read configuration inside the save handler so changes take effect immediately
    const terminal = vscode.window.createTerminal('git-autopush');
    const out = vscode.window.createOutputChannel('git-autopush-debug');
    const onSave = vscode.workspace.onDidSaveTextDocument((doc) => {
        var _a, _b;
        // Read current configuration at save time so updates take effect immediately
        const config = vscode.workspace.getConfiguration('gitAutopush');
        const scriptPathCfg = config.get('scriptPath', '${workspaceFolder}/git-autopush.sh');
        const globs = config.get('watchGlobs', ['**/*.{py,js,ts,md,json,txt}']);
        const dryRun = config.get('dryRun', true);
        const workspaceFolder = ((_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath) || '';
        const rel = workspaceFolder ? path.relative(workspaceFolder, doc.uri.fsPath) : doc.uri.fsPath;
        // check globs
        let matched = false;
        for (const g of globs) {
            if (minimatch(rel, g)) {
                matched = true;
                break;
            }
        }
        if (!matched) {
            return;
        }
        // Aggressively expand vars and normalize script path
        let scriptPath = scriptPathCfg || '';
        if (workspaceFolder) {
            scriptPath = scriptPath.replace(/\$\{workspaceFolder(:[^}]+)?\}/g, workspaceFolder);
            scriptPath = scriptPath.replace(/\$\{workspaceRoot(:[^}]+)?\}/g, workspaceFolder);
        }
        // Expand environment variables like $HOME
        scriptPath = scriptPath.replace(/\$HOME/g, process.env.HOME || '');
        // Expand ~ to home
        if (scriptPath.startsWith('~')) {
            scriptPath = path.join(process.env.HOME || '', scriptPath.slice(1));
        }
        // If still contains ${...} patterns, strip them
        scriptPath = scriptPath.replace(/\$\{[^}]+\}/g, '');
        // If relative, resolve against workspace
        if (!path.isAbsolute(scriptPath) && workspaceFolder) {
            scriptPath = path.resolve(workspaceFolder, scriptPath);
        }
        // Fallback: if resolved path doesn't exist, try common workspace location
        if (!require('fs').existsSync(scriptPath)) {
            const fallback = path.join(workspaceFolder || '', 'git-autopush.sh');
            if (require('fs').existsSync(fallback)) {
                scriptPath = fallback;
            }
        }
        const timestamp = new Date().toISOString();
        const message = `Saved: ${path.basename(rel)}`;
        const quoted = `"${scriptPath.replace(/"/g, '\\"')}"`;
        const cmd = `${quoted} -m "${message.replace(/"/g, '\\"')}" ${dryRun ? '-n' : ''}`;
        out.appendLine(`git-autopush: running command -> ${cmd}`);
        out.show(true);
        terminal.show(true);
        terminal.sendText(cmd, true);
    });
    context.subscriptions.push(onSave);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map