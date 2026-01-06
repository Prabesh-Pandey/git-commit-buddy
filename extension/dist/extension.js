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
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'git-autopush.runOnce';

    function updateStatusBar() {
        try {
            const cfg = vscode.workspace.getConfiguration('gitAutopush');
            const autoCommit = cfg.get('autoCommit', false);
            const autoPush = cfg.get('autoPush', false);
            const dryRun = cfg.get('dryRun', true);
            let text = 'GitAuto:';
            text += autoCommit ? ' Commit-On' : ' Commit-Off';
            text += autoPush ? ' Push-On' : ' Push-Off';
            if (dryRun) {
                text += ' (dry)';
            }
            statusBar.text = text;
            const last = context.workspaceState.get('gitAutopush.lastAction', null);
            statusBar.tooltip = last ? `Last action: ${last}` : 'No actions yet';
            statusBar.show();
        }
        catch (e) {
            // ignore
        }
    }
    updateStatusBar();
    const onSave = vscode.workspace.onDidSaveTextDocument((doc) => {
        var _a, _b;
        // Read current configuration at save time so updates take effect immediately
        const config = vscode.workspace.getConfiguration('gitAutopush');
        const scriptPathCfg = config.get('scriptPath', '${workspaceFolder}/git-autopush.sh');
        const globs = config.get('watchGlobs', ['**/*.{py,js,ts,md,json,txt}']);
        const dryRun = config.get('dryRun', true);
        const autoCommit = config.get('autoCommit', false);
        const autoPush = config.get('autoPush', false);
        const protectedBranches = config.get('protectedBranches', ['main', 'master', 'production']);
        const sensitivePatterns = config.get('sensitiveFileGlobs', ['.env', '*.key', 'credentials.json', '*.pem']);
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

        // If autoCommit is not enabled, skip.
        if (!autoCommit) {
            out.appendLine('git-autopush: autoCommit disabled — skipping.');
            return;
        }

        // Basic safety checks: ensure inside git repo and file isn't ignored/sensitive
        let repoRoot = '';
        try {
            repoRoot = require('child_process').execSync('git rev-parse --show-toplevel', { cwd: workspaceFolder, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        }
        catch (e) {
            out.appendLine('git-autopush: workspace is not a git repository — skipping.');
            return;
        }

        // Don't act on ignored files
        try {
            const check = require('child_process').spawnSync('git', ['check-ignore', doc.uri.fsPath], { cwd: repoRoot });
            if (check.status === 0) {
                out.appendLine(`git-autopush: file is ignored by git (check-ignore) — skipping: ${rel}`);
                return;
            }
        }
        catch (e) {
            // ignore check errors
        }

        // Don't act on sensitive file patterns
        for (const p of sensitivePatterns) {
            if (minimatch(rel, p)) {
                out.appendLine(`git-autopush: file matches sensitive pattern '${p}' — skipping: ${rel}`);
                return;
            }
        }

        // Branch safety: if autoPush enabled, avoid protected branches
        let branch = '';
        try {
            branch = require('child_process').execSync('git symbolic-ref --short HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        }
        catch (e) {
            branch = require('child_process').execSync('git rev-parse --short HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        }
        if (autoPush && protectedBranches.includes(branch)) {
            out.appendLine(`git-autopush: autoPush disabled on protected branch '${branch}' — skipping push.`);
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
        // If autoPush is false, instruct script to commit only (use --no-push / -P)
        const noPushFlag = autoPush ? '' : '-P';
        const cmd = `${quoted} -m "${message.replace(/"/g, '\\"')}" ${dryRun ? '-n' : ''} ${noPushFlag}`.trim();
        out.appendLine(`git-autopush: running command -> ${cmd}`);
        out.show(true);
        terminal.show(true);
        terminal.sendText(cmd, true);
    });
    context.subscriptions.push(onSave);

    // Commands
    const toggleAutoCommit = vscode.commands.registerCommand('git-autopush.toggleAutoCommit', async () => {
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const cur = cfg.get('autoCommit', false);
        await cfg.update('autoCommit', !cur, vscode.ConfigurationTarget.Workspace);
        out.appendLine(`git-autopush: autoCommit set -> ${!cur}`);
        updateStatusBar();
        vscode.window.showInformationMessage(`git-autopush: autoCommit -> ${!cur}`);
    });
    context.subscriptions.push(toggleAutoCommit);

    const toggleAutoPush = vscode.commands.registerCommand('git-autopush.toggleAutoPush', async () => {
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const cur = cfg.get('autoPush', false);
        await cfg.update('autoPush', !cur, vscode.ConfigurationTarget.Workspace);
        out.appendLine(`git-autopush: autoPush set -> ${!cur}`);
        updateStatusBar();
        vscode.window.showInformationMessage(`git-autopush: autoPush -> ${!cur}`);
    });
    context.subscriptions.push(toggleAutoPush);

    const pauseCmd = vscode.commands.registerCommand('git-autopush.pause', async () => {
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const cur = cfg.get('autoCommit', false);
        await cfg.update('autoCommit', !cur, vscode.ConfigurationTarget.Workspace);
        out.appendLine(`git-autopush: pause toggled -> autoCommit ${!cur}`);
        updateStatusBar();
        vscode.window.showInformationMessage(`git-autopush: autoCommit -> ${!cur}`);
    });
    context.subscriptions.push(pauseCmd);

    const runOnceCmd = vscode.commands.registerCommand('git-autopush.runOnce', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('git-autopush: no active editor to run on');
            return;
        }
        const doc = editor.document;
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const scriptPathCfg = cfg.get('scriptPath', '${workspaceFolder}/git-autopush.sh');
        const dryRun = cfg.get('dryRun', true);
        const autoPush = cfg.get('autoPush', false);
        const workspaceFolder = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
        const rel = workspaceFolder ? path.relative(workspaceFolder, doc.uri.fsPath) : doc.uri.fsPath;

        // expand path similar to onSave
        let scriptPath = scriptPathCfg || '';
        if (workspaceFolder) {
            scriptPath = scriptPath.replace(/\$\{workspaceFolder(:[^}]+)?\}/g, workspaceFolder);
            scriptPath = scriptPath.replace(/\$\{workspaceRoot(:[^}]+)?\}/g, workspaceFolder);
        }
        scriptPath = scriptPath.replace(/\$HOME/g, process.env.HOME || '');
        if (scriptPath.startsWith('~')) {
            scriptPath = path.join(process.env.HOME || '', scriptPath.slice(1));
        }
        scriptPath = scriptPath.replace(/\$\{[^}]+\}/g, '');
        if (!path.isAbsolute(scriptPath) && workspaceFolder) {
            scriptPath = path.resolve(workspaceFolder, scriptPath);
        }
        if (!require('fs').existsSync(scriptPath)) {
            const fallback = path.join(workspaceFolder || '', 'git-autopush.sh');
            if (require('fs').existsSync(fallback)) {
                scriptPath = fallback;
            }
        }

        const message = `Manual run: ${path.basename(rel)}`;
        const quoted = `"${scriptPath.replace(/"/g, '\\"')}"`;
        const noPushFlag = autoPush ? '' : '-P';
        const cmd = `${quoted} -m "${message.replace(/"/g, '\\"')}" ${dryRun ? '-n' : ''} ${noPushFlag}`.trim();
        out.appendLine(`git-autopush: manual command -> ${cmd}`);
        context.workspaceState.update('gitAutopush.lastAction', new Date().toISOString());
        updateStatusBar();
        terminal.show(true);
        terminal.sendText(cmd, true);
    });
    context.subscriptions.push(runOnceCmd);

    context.subscriptions.push(statusBar);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map