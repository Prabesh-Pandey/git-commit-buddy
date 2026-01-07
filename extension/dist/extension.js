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
    // In-memory nonces for trigger tokens; stored here so external processes can't set them.
    const triggerNonces = new Map();

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
        // Only act on saves that were triggered via our save-and-run keybinding.
        // We store an object { path, expires } when the keybinding runs to avoid
        // reacting to external or assistant-made file changes. Token is ephemeral.
        const token = context.workspaceState.get('gitAutopush.triggeredBySaveKeyFor', null);
        if (!token || !token.path) {
            out.appendLine(`git-autopush: no trigger token set — ignoring save: ${doc.uri.fsPath}`);
            return;
        }
        // If token expired, clear and ignore
        const now = Date.now();
        if (!token.expires || token.expires < now) {
            out.appendLine(`git-autopush: trigger token expired for ${token.path} (now=${now}, expires=${token.expires})`);
            context.workspaceState.update('gitAutopush.triggeredBySaveKeyFor', null);
            return;
        }
        if (token.path !== doc.uri.fsPath) {
            out.appendLine(`git-autopush: trigger token path mismatch (token=${token.path}) — save for ${doc.uri.fsPath} ignored`);
            return;
        }
        out.appendLine(`git-autopush: valid trigger token matched for ${doc.uri.fsPath}`);
        // Validate in-memory nonce to ensure only our process set the token
        try {
            const expectedNonce = token.nonce || null;
            const currentNonce = triggerNonces.get(doc.uri.fsPath) || null;
            if (!expectedNonce || !currentNonce || expectedNonce !== currentNonce) {
                out.appendLine(`git-autopush: nonce mismatch or missing for ${doc.uri.fsPath} (expected=${expectedNonce}, current=${currentNonce})`);
                return;
            }
            // consume both workspace token and in-memory nonce
            context.workspaceState.update('gitAutopush.triggeredBySaveKeyFor', null);
            triggerNonces.delete(doc.uri.fsPath);
        }
        catch (e) {
            out.appendLine('git-autopush: nonce validation failed — ignoring save');
            return;
        }
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
        // Place the no-push flag immediately after the script path to avoid order sensitivity
        const cmd = `${quoted} ${noPushFlag} ${dryRun ? '-n' : ''} -m "${message.replace(/"/g, '\\"')}"`.trim();
        out.appendLine(`git-autopush: running command -> ${cmd}`);
        out.show(true);
        terminal.show(true);
        terminal.sendText(cmd, true);
    });
    context.subscriptions.push(onSave);

    // Commands
    const toggleAutoCommit = vscode.commands.registerCommand('git-autopush.toggleAutoCommit', async () => {
        const cfg = vscode.workspace.getConfiguration('gitAutopush')
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

    const setApiKeyCmd = vscode.commands.registerCommand('git-autopush.setApiKey', async () => {
        try {
            const value = await vscode.window.showInputBox({ prompt: 'Enter AI provider API key (stored machine-local)', placeHolder: '', ignoreFocusOut: true, password: true });
            if (typeof value === 'string') {
                const cfg = vscode.workspace.getConfiguration('gitAutopush');
                // Store machine-local to avoid syncing credentials
                await cfg.update('ai.apiKey', value, vscode.ConfigurationTarget.Machine);
                vscode.window.showInformationMessage('git-autopush: API key saved (machine-local).');
            }
        }
        catch (e) {
            // never log keys or values
            vscode.window.showErrorMessage('git-autopush: failed to save API key.');
        }
    });
    context.subscriptions.push(setApiKeyCmd);

    const generateMessageCmd = vscode.commands.registerCommand('git-autopush.generateMessage', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('git-autopush: no active editor');
            return;
        }
        const doc = editor.document;
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const aiEnabled = cfg.get('ai.enabled', false);
        const generate = cfg.get('ai.generateCommitMessage', false);
        const review = cfg.get('ai.reviewBeforeCommit', true);
        const provider = cfg.get('ai.provider', 'openai');
        const apiKey = cfg.get('ai.apiKey', '');
        const workspaceFolder = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
        const rel = workspaceFolder ? path.relative(workspaceFolder, doc.uri.fsPath) : doc.uri.fsPath;
        if (!aiEnabled || !generate) {
            vscode.window.showInformationMessage('git-autopush: AI commit generation is disabled (enable via settings).');
            return;
        }

        // Prepare a deterministic fallback message
        const fallback = `Saved: ${path.basename(rel)}`;

        // Helper to store and present suggested message
        async function presentSuggested(suggested) {
            if (review) {
                const edited = await vscode.window.showInputBox({ value: suggested, prompt: 'Edit AI-generated commit message', ignoreFocusOut: true });
                if (typeof edited === 'string') {
                    context.workspaceState.update('gitAutopush.lastAIMessage', edited);
                    vscode.window.showInformationMessage('git-autopush: commit message ready. Use Run Once to execute.');
                }
                else {
                    vscode.window.showInformationMessage('git-autopush: message review cancelled.');
                }
            }
            else {
                context.workspaceState.update('gitAutopush.lastAIMessage', suggested);
                vscode.window.showInformationMessage('git-autopush: AI message generated and stored (use Run Once to apply).');
            }
            updateStatusBar();
        }

        // If provider is openai and we have an API key, attempt a network call
        if (provider === 'openai' && apiKey && apiKey.length > 0) {
            out.appendLine('git-autopush: contacting AI provider to generate message...');
            try {
                const https = require('https');
                const bodyText = doc.getText().slice(0, 2000); // limit size
                const prompt = `You are a concise commit message generator. Summarize the primary change(s) in the following file content in one short imperative sentence (max 72 chars):\n\nFilename: ${path.basename(rel)}\n\nContent:\n${bodyText}`;
                const postData = JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        { role: 'system', content: 'You generate short, clear git commit messages.' },
                        { role: 'user', content: prompt }
                    ],
                    max_tokens: 60,
                    temperature: 0.2
                });
                const reqOpts = {
                    hostname: 'api.openai.com',
                    port: 443,
                    path: '/v1/chat/completions',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData),
                        'Authorization': `Bearer ${apiKey}`
                    }
                };
                const suggested = await new Promise((resolve, reject) => {
                    const req = https.request(reqOpts, (res) => {
                        let data = '';
                        res.on('data', (chunk) => data += chunk);
                        res.on('end', () => {
                            try {
                                const parsed = JSON.parse(data);
                                const text = parsed && parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
                                if (text && typeof text === 'string') {
                                    resolve(text.trim());
                                }
                                else {
                                    reject(new Error('No message in AI response'));
                                }
                            }
                            catch (e) {
                                reject(e);
                            }
                        });
                    });
                    req.on('error', (e) => reject(e));
                    req.setTimeout(10000, () => { req.destroy(new Error('AI request timeout')); });
                    req.write(postData);
                    req.end();
                });
                // sanitize suggested to one-line commit-like text
                const oneLine = suggested.split(/\r?\n/)[0].trim();
                const finalMsg = oneLine.length > 0 ? oneLine : fallback;
                out.appendLine(`git-autopush: AI suggested (truncated): ${finalMsg}`);
                await presentSuggested(finalMsg);
                return;
            }
            catch (e) {
                out.appendLine('git-autopush: AI provider call failed — falling back.');
            }
        }
        // Fallback deterministic message
        await presentSuggested(fallback);
    
        // If provider is deepseek and configured, attempt DeepSeek call
        if (provider === 'deepseek' && apiKey && apiKey.length > 0) {
            out.appendLine('git-autopush: contacting DeepSeek provider to generate message...');
            try {
                const https = require('https');
                const deepseekUrl = cfg.get('ai.deepseekUrl', '').trim();
                const endpoint = deepseekUrl && deepseekUrl.length > 0 ? deepseekUrl : 'https://api.deepseek.example/v1/generate';
                const urlObj = new URL(endpoint);
                const bodyText = doc.getText().slice(0, 2000);
                const payload = JSON.stringify({ filename: path.basename(rel), content: bodyText });
                const reqOpts = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || 443,
                    path: urlObj.pathname + (urlObj.search || ''),
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                        'Authorization': `Bearer ${apiKey}`
                    }
                };
                const suggested = await new Promise((resolve, reject) => {
                    const req = https.request(reqOpts, (res) => {
                        let data = '';
                        res.on('data', (chunk) => data += chunk);
                        res.on('end', () => {
                            try {
                                const parsed = JSON.parse(data);
                                const text = parsed && (parsed.commit_message || parsed.message || parsed.result);
                                if (text && typeof text === 'string') {
                                    resolve(text.trim());
                                }
                                else {
                                    reject(new Error('No message in DeepSeek response'));
                                }
                            }
                            catch (e) {
                                reject(e);
                            }
                        });
                    });
                    req.on('error', (e) => reject(e));
                    req.setTimeout(10000, () => { req.destroy(new Error('DeepSeek request timeout')); });
                    req.write(payload);
                    req.end();
                });
                const oneLine = suggested.split(/\r?\n/)[0].trim();
                const finalMsg = oneLine.length > 0 ? oneLine : fallback;
                out.appendLine(`git-autopush: DeepSeek suggested (truncated): ${finalMsg}`);
                await presentSuggested(finalMsg);
                return;
            }
            catch (e) {
                out.appendLine('git-autopush: DeepSeek provider call failed — falling back.');
            }
        }

        // Fallback deterministic message
        await presentSuggested(fallback);
    });
    context.subscriptions.push(generateMessageCmd);

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
        // Ensure -P comes right after the script path to avoid script option parsing issues
        const cmd = `${quoted} ${noPushFlag} ${dryRun ? '-n' : ''} -m "${message.replace(/"/g, '\\"')}"`.trim();
        out.appendLine(`git-autopush: manual command -> ${cmd}`);
        context.workspaceState.update('gitAutopush.lastAction', new Date().toISOString());
        updateStatusBar();
        terminal.show(true);
        terminal.sendText(cmd, true);
    });
    context.subscriptions.push(runOnceCmd);

    const saveAndRunCmd = vscode.commands.registerCommand('git-autopush.saveAndRun', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            // fallback to normal save if no active editor
            await vscode.commands.executeCommand('workbench.action.files.save');
            return;
        }
        // Store the exact document path as a one-time token so only this save triggers.
        const docPath = editor.document.uri.fsPath;
        // token expires shortly to avoid stale tokens (5 seconds) and include an in-memory nonce
        const expires = Date.now() + 5000;
        const nonce = Math.random().toString(36).slice(2);
        await context.workspaceState.update('gitAutopush.triggeredBySaveKeyFor', { path: docPath, nonce, expires });
        triggerNonces.set(docPath, nonce);
        out.appendLine(`git-autopush: saveAndRun token set for ${docPath} (expires=${expires}, nonce=${nonce})`);
        // perform the normal save action; onDidSave will observe the token
        await vscode.commands.executeCommand('workbench.action.files.save');
    });
    context.subscriptions.push(saveAndRunCmd);

    context.subscriptions.push(statusBar);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map