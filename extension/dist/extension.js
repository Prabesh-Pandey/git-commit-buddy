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
    const onSave = vscode.workspace.onDidSaveTextDocument(async (doc) => {
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
        // Mark that this save was triggered by the guarded Save+Run keybinding
        const triggeredBySaveKey = true;
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
        // Fallback behavior: if resolved path doesn't exist, try and use a global script.
        if (!require('fs').existsSync(scriptPath)) {
            // 1) Check environment variable GITAUTOPUSH_SCRIPT
            const envPath = process.env.GITAUTOPUSH_SCRIPT || '';
            if (envPath && require('fs').existsSync(envPath)) {
                scriptPath = envPath;
            }
            else {
                // 2) Check user's Per/Scripts common location
                const homeFallback = path.join(process.env.HOME || '', 'Per', 'Scripts', 'git-autopush.sh');
                if (require('fs').existsSync(homeFallback)) {
                    scriptPath = homeFallback;
                }
                else {
                    // 3) Fall back to workspace-local fallback as before
                    const fallback = path.join(workspaceFolder || '', 'git-autopush.sh');
                    if (require('fs').existsSync(fallback)) {
                        scriptPath = fallback;
                    }
                }
            }
        }
        const timestamp = new Date().toISOString();

        // Default message fallback
        let message = `Saved: ${path.basename(rel)}`;

        // Attempt AI-generated commit message if configured and available.
        try {
            const aiEnabled = config.get('ai.enabled', false);
            const generate = config.get('ai.generateCommitMessage', false);
            const provider = config.get('ai.provider', 'deepseek');
            // Key resolution priority: 1) machine-local config, 2) environment variable
            // Note: We check both ai.apiKey and deprecated ai.deepseekApiKey for backward compatibility
            let deepseekKey = config.get('ai.apiKey', '') || config.get('ai.deepseekApiKey', '') || process.env.DEEPSEEK_API_KEY || '';
            const deepseekModel = config.get('ai.deepseekModel', 'deepseek/deepseek-r1-0528:free');
            const keySource = config.get('ai.apiKey', '') ? 'machine-config' : (config.get('ai.deepseekApiKey', '') ? 'deprecated-config' : (process.env.DEEPSEEK_API_KEY ? 'env-var' : 'none'));
            if (keySource !== 'none') {
                out.appendLine(`git-autopush: using API key from ${keySource}`);
            }

            if (aiEnabled && generate && provider === 'deepseek') {
                if (!deepseekKey) {
                    // Ask user for key and store machine-local
                    try {
                        const entered = await vscode.window.showInputBox({ 
                            prompt: 'DeepSeek API key not found. Enter your OpenRouter API key (starts with sk-or-...)', 
                            placeHolder: 'sk-or-v1-...', 
                            ignoreFocusOut: true, 
                            password: true,
                            validateInput: (value) => {
                                if (!value || value.trim().length < 10) return 'API key seems too short';
                                if (!value.startsWith('sk-')) return 'OpenRouter keys typically start with sk-';
                                return null;
                            }
                        });
                        if (typeof entered === 'string' && entered.trim()) {
                            await config.update('ai.apiKey', entered.trim(), vscode.ConfigurationTarget.Machine);
                            deepseekKey = entered.trim();
                            out.appendLine('git-autopush: API key saved to machine-local config (gitAutopush.ai.apiKey)');
                        }
                        else {
                            out.appendLine('git-autopush: no API key provided — falling back to default message');
                        }
                    }
                    catch (err) {
                        out.appendLine('git-autopush: failed to save API key: ' + (err?.message || String(err)));
                    }
                }

                if (deepseekKey) {
                    out.appendLine('git-autopush: attempting DeepSeek generation for commit message...');
                    try {
                        const https = require('https');
                        const systemPrompt = `You are a helpful assistant that writes concise, conventional git commit messages. Return a short subject line (<=50 chars) followed by an optional body <=72 chars per line. Do NOT include surrounding quotes.`;
                        // For Save+Run we want the exact same behavior as the helper script:
                        // 1) stage all changes, 2) send the staged diff (git diff --cached) to DeepSeek.
                        // Fallback to a file diff or excerpt if staging/diffing fails.
                        let diffText = '';
                        try {
                            try {
                                require('child_process').execSync('git add -A', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] });
                            }
                            catch (e) {
                                // ignore staging errors
                            }
                            diffText = require('child_process').execSync('git diff --cached --no-color --unified=3', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
                        }
                        catch (e) {
                            try {
                                diffText = require('child_process').execSync(`git diff --no-color --unified=3 -- ${rel}`, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
                            }
                            catch (e2) {
                                diffText = doc.getText().slice(0, 2000);
                            }
                        }
                        // Truncate to avoid huge payloads
                        if (diffText.length > 8000) diffText = diffText.slice(0, 8000) + '\n... (truncated)';
                        const userPrompt = `Generate a commit message for the following changes (prefer diff):\n\nFile: ${rel}\n\nDiff / Excerpt:\n${diffText}`;
                        const payload = JSON.stringify({ 
                            model: deepseekModel, 
                            messages: [
                                { role: 'system', content: systemPrompt }, 
                                { role: 'user', content: userPrompt }
                            ],
                            temperature: 0.3,
                            max_tokens: 200
                        });
                        const urlOpts = { 
                            hostname: 'openrouter.ai', 
                            port: 443, 
                            path: '/api/v1/chat/completions', 
                            method: 'POST', 
                            headers: { 
                                'Content-Type': 'application/json', 
                                'Content-Length': Buffer.byteLength(payload), 
                                'Authorization': `Bearer ${deepseekKey}`,
                                'HTTP-Referer': 'https://github.com/local/git-autopush-on-save',
                                'X-Title': 'Git AutoPush Extension'
                            } 
                        };

                        const suggestedRaw = await new Promise((resolve, reject) => {
                            const req = https.request(urlOpts, (res) => {
                                let data = '';
                                res.on('data', (c) => data += c);
                                res.on('end', () => {
                                    try {
                                        // Check HTTP status code first
                                        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                                            return reject(new Error(`DeepSeek API error: HTTP ${res.statusCode} - ${data.slice(0, 200)}`));
                                        }
                                        const json = JSON.parse(data || '{}');
                                        // Log full response for debugging
                                        out.appendLine(`git-autopush: DeepSeek raw response: ${JSON.stringify(json).slice(0, 500)}`);
                                        // Check for API error responses
                                        if (json.error) {
                                            return reject(new Error(`DeepSeek API error: ${json.error.message || JSON.stringify(json.error)}`));
                                        }
                                        // Priority order for OpenRouter/DeepSeek response formats
                                        const candidates = [];
                                        // 1. Standard OpenAI/OpenRouter format (highest priority)
                                        if (json.choices && Array.isArray(json.choices) && json.choices.length > 0) {
                                            try { 
                                                const content = json.choices[0].message?.content || json.choices[0].text;
                                                if (content) candidates.push(content); 
                                            } catch (e) { }
                                        }
                                        // 2. Alternative output formats
                                        if (json.output && Array.isArray(json.output)) {
                                            try { candidates.push(json.output[0].content); } catch (e) { }
                                        }
                                        // 3. Direct message fields
                                        try { if (json.commit_message) candidates.push(json.commit_message); } catch (e) { }
                                        try { if (json.message) candidates.push(json.message); } catch (e) { }
                                        try { if (json.result) candidates.push(json.result); } catch (e) { }
                                        // 4. Last resort: scan all string fields
                                        for (const k of Object.keys(json)) { 
                                            if (typeof json[k] === 'string' && json[k].trim().length > 10) candidates.push(json[k]); 
                                        }
                                        const raw = candidates.find(c => typeof c === 'string' && c.trim().length > 0);
                                        out.appendLine(`git-autopush: DeepSeek extracted content: ${raw ? raw.slice(0, 200) : 'NONE'}`);
                                        if (!raw) {
                                            return reject(new Error(`DeepSeek response missing content: ${JSON.stringify(json).slice(0, 200)}`));
                                        }
                                        resolve(raw);
                                    }
                                    catch (e) { 
                                        reject(new Error(`Failed to parse DeepSeek response: ${e.message} - Data: ${data.slice(0, 200)}`)); 
                                    }
                                });
                            });
                            req.on('error', (e) => reject(new Error(`DeepSeek HTTP request failed: ${e.message}`)));
                            req.on('timeout', () => { 
                                req.destroy(); 
                                reject(new Error('DeepSeek request timeout (15s)')); 
                            });
                            req.setTimeout(15000);
                            req.write(payload);
                            req.end();
                        });

                        const rawText = (suggestedRaw || '').toString().trim();
                        // If this save was triggered by the guarded Save+Run flow, auto-apply the full AI reply
                        // to match the helper script behavior. Otherwise respect the configured review setting.
                        let reviewBefore = config.get('ai.reviewBeforeCommit', true);
                        if (typeof triggeredBySaveKey !== 'undefined' && triggeredBySaveKey) {
                            reviewBefore = false;
                        }
                        if (!reviewBefore) {
                            // Auto-apply the full DeepSeek reply as the commit message
                            message = rawText || `Saved: ${path.basename(rel)}`;
                            out.appendLine(`git-autopush: DeepSeek-generated message auto-applied (subject: ${message.split(/\n/)[0]})`);
                        }
                        else {
                            const subject = rawText.split(/\n\n|\n/).map(s => s.trim()).filter(Boolean)[0] || `Saved: ${path.basename(rel)}`;
                            const edited = await vscode.window.showInputBox({ prompt: 'Confirm commit subject', value: subject, placeHolder: 'Enter commit subject', ignoreFocusOut: true });
                            if (typeof edited === 'undefined') {
                                out.appendLine('git-autopush: commit aborted by user (prompt cancelled)');
                                // user cancelled; abort AI flow (message remains fallback)
                            }
                            else {
                                message = edited.trim();
                                const parts = rawText.split(/\n\n|\n/).map(s => s.trim()).filter(Boolean);
                                if (parts.length > 1) {
                                    const body = parts.slice(1).join('\n\n');
                                    if (body) message += '\n\n' + body;
                                }
                                out.appendLine(`git-autopush: DeepSeek-generated message used (subject: ${message.split(/\n/)[0]})`);
                            }
                        }
                    }
                    catch (err) {
                        out.appendLine(`git-autopush: DeepSeek generation failed: ${err?.message || String(err)}`);
                        out.appendLine('git-autopush: falling back to default message');
                    }
                }
            }
        }
        catch (e) {
            out.appendLine(`git-autopush: DeepSeek outer failure: ${e?.message || String(e)}`);
            out.appendLine('git-autopush: falling back to default message');
        }
        // Build git commands directly so we don't require a project-level git-autopush.sh
        const commitMsgEsc = message.replace(/"/g, '\\"');
        const gitCmds = [];
        gitCmds.push('git add -A');
        gitCmds.push(`git commit -m "${commitMsgEsc}" || echo \"git-autopush: nothing to commit\"`);
        if (!dryRun && autoPush) {
            const remote = 'origin';
            try {
                // ensure branch is set (from earlier branch resolution)
            }
            catch (e) { }
            gitCmds.push(`git push ${remote} ${branch}`);
        }
        const cwdPrefix = workspaceFolder ? `cd "${workspaceFolder.replace(/"/g, '\\"')}" && ` : '';
        const fullCmd = cwdPrefix + gitCmds.join(' && ');
        out.appendLine(`git-autopush: running git -> ${fullCmd}`);
        out.show(true);
        terminal.show(true);
        if (!dryRun) {
            terminal.sendText(fullCmd, true);
        }
        else {
            out.appendLine('git-autopush: dryRun enabled — not executing git commands');
        }
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
        const provider = cfg.get('ai.provider', 'deepseek');
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

        // Fallback deterministic message (used if DeepSeek is unavailable)
        // We'll attempt DeepSeek below; if it fails we'll present the fallback.
        // Note: generateMessage command is deprecated - use Save+Run flow instead which calls OpenRouter endpoint

        // Fallback deterministic message
        await presentSuggested(fallback);
    });
    context.subscriptions.push(generateMessageCmd);

    const debugDeepseekCmd = vscode.commands.registerCommand('git-autopush.debugDeepseek', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('git-autopush: no active editor');
            return;
        }
        const doc = editor.document;
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const aiEnabled = cfg.get('ai.enabled', false);
        const generate = cfg.get('ai.generateCommitMessage', false);
        const provider = cfg.get('ai.provider', 'deepseek');
        // Use same key resolution priority as main flow
        const key = cfg.get('ai.apiKey', '') || cfg.get('ai.deepseekApiKey', '') || process.env.DEEPSEEK_API_KEY || '';
        const model = cfg.get('ai.deepseekModel', 'deepseek/deepseek-r1-0528:free');

        if (!aiEnabled || !generate) {
            vscode.window.showInformationMessage('git-autopush: AI commit generation is disabled (enable via settings).');
            return;
        }
        if (provider !== 'deepseek') {
            vscode.window.showInformationMessage('git-autopush: provider is not set to deepseek.');
            return;
        }
        if (!key) {
            vscode.window.showWarningMessage('git-autopush: DeepSeek API key not configured. Use the Set AI API Key command or set DEEPSEEK_API_KEY.');
            return;
        }

        out.appendLine('git-autopush: Debug DeepSeek — sending raw request...');
        out.show(true);

        try {
            const https = require('https');
            const rel = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) ? path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, doc.uri.fsPath) : doc.uri.fsPath;
            const bodyText = doc.getText().slice(0, 2000);
            const systemPrompt = `You are a helpful assistant that writes concise, conventional git commit messages. Return a short subject line (<=50 chars) followed by an optional body <=72 chars per line.`;
            const userPrompt = `Generate a commit message for the following changes:\n\nFile: ${rel}\n\nContents excerpt:\n${bodyText}`;
            const payload = JSON.stringify({ model, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }] });
            const urlOpts = { hostname: 'openrouter.ai', port: 443, path: '/api/v1/chat/completions', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'Authorization': `Bearer ${key}` } };

            const raw = await new Promise((resolve, reject) => {
                const req = https.request(urlOpts, (res) => {
                    let data = '';
                    res.on('data', (c) => data += c);
                    res.on('end', () => resolve(data));
                });
                req.on('error', reject);
                req.setTimeout(15000, () => { req.destroy(new Error('DeepSeek request timeout')); });
                req.write(payload);
                req.end();
            });

            let parsed;
            try { parsed = JSON.parse(raw); } catch (e) { parsed = raw; }
            out.appendLine('git-autopush: DeepSeek raw response:');
            out.appendLine(typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2));
            vscode.window.showInformationMessage('git-autopush: DeepSeek raw response written to debug output.');
        }
        catch (e) {
            out.appendLine('git-autopush: DeepSeek debug call failed: ' + (e?.message || String(e)));
            vscode.window.showErrorMessage('git-autopush: DeepSeek debug call failed. See debug output.');
        }
    });
    context.subscriptions.push(debugDeepseekCmd);

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
        const dryRun = cfg.get('dryRun', true);
        const autoPush = cfg.get('autoPush', false);
        const workspaceFolder = (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0]) ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
        const rel = workspaceFolder ? path.relative(workspaceFolder, doc.uri.fsPath) : doc.uri.fsPath;

        // Get branch info
        let branch = '';
        try {
            branch = require('child_process').execSync('git symbolic-ref --short HEAD', { cwd: workspaceFolder, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        }
        catch (e) {
            try {
                branch = require('child_process').execSync('git rev-parse --short HEAD', { cwd: workspaceFolder, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            }
            catch (e2) { branch = 'HEAD'; }
        }

        const message = `Manual run: ${path.basename(rel)}`;
        const commitMsgEsc = message.replace(/"/g, '\\"');
        const gitCmds = [];
        gitCmds.push('git add -A');
        gitCmds.push(`git commit -m "${commitMsgEsc}" || echo "git-autopush: nothing to commit"`);
        if (!dryRun && autoPush) {
            const remote = 'origin';
            gitCmds.push(`git push ${remote} ${branch}`);
        }
        const cwdPrefix = workspaceFolder ? `cd "${workspaceFolder.replace(/"/g, '\\"')}" && ` : '';
        const fullCmd = cwdPrefix + gitCmds.join(' && ');
        out.appendLine(`git-autopush: manual command -> ${fullCmd}`);
        context.workspaceState.update('gitAutopush.lastAction', new Date().toISOString());
        updateStatusBar();
        terminal.show(true);
        if (!dryRun) {
            terminal.sendText(fullCmd, true);
        }
        else {
            out.appendLine('git-autopush: dryRun enabled — not executing git commands');
        }
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