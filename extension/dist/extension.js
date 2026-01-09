"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const path = require("path");
const minimatch = require("minimatch");

function activate(context) {
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🚀 GIT AUTOPUSH ON SAVE - ENHANCED EDITION
    // ═══════════════════════════════════════════════════════════════════════════════
    
    const terminal = vscode.window.createTerminal('git-autopush');
    const out = vscode.window.createOutputChannel('git-autopush-debug');
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.command = 'git-autopush.showQuickActions';
    
    // In-memory state
    const triggerNonces = new Map();
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 📊 COMMIT STATISTICS & GAMIFICATION
    // ═══════════════════════════════════════════════════════════════════════════════
    
    function getStats() {
        return context.globalState.get('gitAutopush.stats', {
            totalCommits: 0,
            todayCommits: 0,
            lastCommitDate: null,
            streak: 0,
            longestStreak: 0,
            commitHistory: [],
            achievements: []
        });
    }
    
    function saveStats(stats) {
        context.globalState.update('gitAutopush.stats', stats);
    }
    
    function updateStats(commitMessage) {
        const stats = getStats();
        const today = new Date().toDateString();
        const lastDate = stats.lastCommitDate ? new Date(stats.lastCommitDate).toDateString() : null;
        
        stats.totalCommits++;
        
        if (lastDate === today) {
            stats.todayCommits++;
        } else {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            if (lastDate === yesterday.toDateString()) {
                stats.streak++;
            } else if (lastDate !== today) {
                stats.streak = 1;
            }
            stats.todayCommits = 1;
        }
        
        if (stats.streak > stats.longestStreak) {
            stats.longestStreak = stats.streak;
        }
        
        stats.lastCommitDate = new Date().toISOString();
        
        stats.commitHistory.unshift({
            message: commitMessage.slice(0, 100),
            timestamp: new Date().toISOString()
        });
        if (stats.commitHistory.length > 50) {
            stats.commitHistory.pop();
        }
        
        checkAchievements(stats);
        saveStats(stats);
        return stats;
    }
    
    function checkAchievements(stats) {
        const achievements = [
            { id: 'first_commit', name: '🎉 First Commit!', condition: () => stats.totalCommits >= 1 },
            { id: 'ten_commits', name: '🔟 Ten Commits!', condition: () => stats.totalCommits >= 10 },
            { id: 'fifty_commits', name: '🎯 50 Commits!', condition: () => stats.totalCommits >= 50 },
            { id: 'hundred_commits', name: '💯 100 Commits!', condition: () => stats.totalCommits >= 100 },
            { id: 'streak_3', name: '🔥 3 Day Streak!', condition: () => stats.streak >= 3 },
            { id: 'streak_7', name: '🌟 Week Warrior!', condition: () => stats.streak >= 7 },
            { id: 'streak_30', name: '👑 Monthly Master!', condition: () => stats.streak >= 30 },
            { id: 'productive_day', name: '⚡ Super Productive!', condition: () => stats.todayCommits >= 10 },
        ];
        
        for (const ach of achievements) {
            if (!stats.achievements.includes(ach.id) && ach.condition()) {
                stats.achievements.push(ach.id);
                vscode.window.showInformationMessage(`🏆 Achievement Unlocked: ${ach.name}`);
            }
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🎨 ENHANCED STATUS BAR
    // ═══════════════════════════════════════════════════════════════════════════════
    
    function updateStatusBar() {
        try {
            const cfg = vscode.workspace.getConfiguration('gitAutopush');
            const autoCommit = cfg.get('autoCommit', false);
            const autoPush = cfg.get('autoPush', false);
            const dryRun = cfg.get('dryRun', true);
            const showStats = cfg.get('showStatsInStatusBar', true);
            const stats = getStats();
            
            let icon = autoCommit ? '$(git-commit)' : '$(circle-slash)';
            let text = icon;
            
            if (autoCommit) {
                text += autoPush ? ' Auto' : ' Commit';
                if (dryRun) text += ' (dry)';
            } else {
                text += ' Off';
            }
            
            if (showStats && stats.streak > 0) {
                text += ` 🔥${stats.streak}`;
            }
            
            statusBar.text = text;
            
            const tooltipLines = [
                `**Git AutoPush** $(git-commit)`,
                `---`,
                `Auto Commit: ${autoCommit ? '✅ On' : '❌ Off'}`,
                `Auto Push: ${autoPush ? '✅ On' : '❌ Off'}`,
                `Dry Run: ${dryRun ? '🧪 Yes' : '🚀 No'}`,
                `---`,
                `📊 **Stats**`,
                `Total: ${stats.totalCommits} | Today: ${stats.todayCommits}`,
                `Streak: ${stats.streak} 🔥 | Best: ${stats.longestStreak}`,
                `---`,
                `*Click for quick actions*`
            ];
            
            statusBar.tooltip = new vscode.MarkdownString(tooltipLines.join('\n'));
            statusBar.tooltip.isTrusted = true;
            statusBar.backgroundColor = autoCommit && !dryRun 
                ? new vscode.ThemeColor('statusBarItem.warningBackground') 
                : undefined;
            statusBar.show();
        }
        catch (e) {
            out.appendLine(`git-autopush: statusBar error: ${e?.message || e}`);
        }
    }
    updateStatusBar();
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 💾 UNDO LAST COMMIT FEATURE  
    // ═══════════════════════════════════════════════════════════════════════════════
    
    let lastCommitInfo = null;
    
    function storeLastCommit(workspaceFolder, message) {
        try {
            const hash = require('child_process')
                .execSync('git rev-parse HEAD', { cwd: workspaceFolder, stdio: ['ignore', 'pipe', 'ignore'] })
                .toString().trim();
            lastCommitInfo = { hash, message, workspace: workspaceFolder, timestamp: Date.now() };
        } catch (e) {
            lastCommitInfo = null;
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🎯 MAIN SAVE HANDLER
    // ═══════════════════════════════════════════════════════════════════════════════
    
    const onSave = vscode.workspace.onDidSaveTextDocument(async (doc) => {
        const token = context.workspaceState.get('gitAutopush.triggeredBySaveKeyFor', null);
        if (!token || !token.path) {
            out.appendLine(`git-autopush: no trigger token — ignoring save: ${doc.uri.fsPath}`);
            return;
        }
        
        const now = Date.now();
        if (!token.expires || token.expires < now) {
            out.appendLine(`git-autopush: token expired for ${token.path}`);
            context.workspaceState.update('gitAutopush.triggeredBySaveKeyFor', null);
            return;
        }
        
        if (token.path !== doc.uri.fsPath) {
            out.appendLine(`git-autopush: token path mismatch — ignoring ${doc.uri.fsPath}`);
            return;
        }
        
        out.appendLine(`git-autopush: valid token for ${doc.uri.fsPath}`);
        const triggeredBySaveKey = true;
        
        try {
            const expectedNonce = token.nonce || null;
            const currentNonce = triggerNonces.get(doc.uri.fsPath) || null;
            if (!expectedNonce || !currentNonce || expectedNonce !== currentNonce) {
                out.appendLine(`git-autopush: nonce mismatch`);
                return;
            }
            context.workspaceState.update('gitAutopush.triggeredBySaveKeyFor', null);
            triggerNonces.delete(doc.uri.fsPath);
        }
        catch (e) {
            out.appendLine('git-autopush: nonce validation failed');
            return;
        }
        
        var _a, _b;
        const config = vscode.workspace.getConfiguration('gitAutopush');
        const globs = config.get('watchGlobs', ['**/*.{py,js,ts,md,json,txt}']);
        const dryRun = config.get('dryRun', true);
        const autoCommit = config.get('autoCommit', false);
        const autoPush = config.get('autoPush', false);
        const protectedBranches = config.get('protectedBranches', ['main', 'master', 'production']);
        const sensitivePatterns = config.get('sensitiveFileGlobs', ['.env', '*.key', 'credentials.json', '*.pem']);
        const useEmoji = config.get('useEmoji', true);
        const workspaceFolder = ((_b = (_a = vscode.workspace.workspaceFolders) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.uri.fsPath) || '';
        const rel = workspaceFolder ? path.relative(workspaceFolder, doc.uri.fsPath) : doc.uri.fsPath;
        
        let matched = false;
        for (const g of globs) {
            if (minimatch(rel, g)) {
                matched = true;
                break;
            }
        }
        if (!matched) return;
        
        if (!autoCommit) {
            out.appendLine('git-autopush: autoCommit disabled — skipping');
            return;
        }
        
        let repoRoot = '';
        try {
            repoRoot = require('child_process').execSync('git rev-parse --show-toplevel', { cwd: workspaceFolder, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        }
        catch (e) {
            out.appendLine('git-autopush: not a git repository');
            vscode.window.showWarningMessage('Git AutoPush: Not a git repository');
            return;
        }
        
        try {
            const check = require('child_process').spawnSync('git', ['check-ignore', doc.uri.fsPath], { cwd: repoRoot });
            if (check.status === 0) {
                out.appendLine(`git-autopush: file ignored by git — skipping`);
                return;
            }
        }
        catch (e) { }
        
        for (const p of sensitivePatterns) {
            if (minimatch(rel, p)) {
                out.appendLine(`git-autopush: sensitive file — skipping`);
                vscode.window.showWarningMessage(`Git AutoPush: Skipping sensitive file`);
                return;
            }
        }
        
        let branch = '';
        try {
            branch = require('child_process').execSync('git symbolic-ref --short HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        }
        catch (e) {
            branch = require('child_process').execSync('git rev-parse --short HEAD', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
        }
        
        let canPush = autoPush;
        if (autoPush && protectedBranches.includes(branch)) {
            out.appendLine(`git-autopush: protected branch '${branch}' — no push`);
            canPush = false;
        }
        
        let message = `Saved: ${path.basename(rel)}`;
        
        // ═══════════════════════════════════════════════════════════════════════════
        // 🤖 AI COMMIT MESSAGE GENERATION
        // ═══════════════════════════════════════════════════════════════════════════
        
        try {
            const aiEnabled = config.get('ai.enabled', true);
            const generate = config.get('ai.generateCommitMessage', true);
            const provider = config.get('ai.provider', 'deepseek');
            let deepseekKey = config.get('ai.apiKey', '') || config.get('ai.deepseekApiKey', '') || process.env.DEEPSEEK_API_KEY || '';
            // Use Google Gemini 2.0 Flash - fast, accurate, and FREE
            const deepseekModel = config.get('ai.deepseekModel', 'google/gemini-2.0-flash-exp:free');
            
            out.appendLine(`git-autopush: AI config - enabled=${aiEnabled}, generate=${generate}, provider=${provider}, hasKey=${!!deepseekKey}, keyLen=${deepseekKey?.length || 0}, model=${deepseekModel}`);
            
            // Run AI if enabled and generate is on
            if (aiEnabled && generate) {
                // Prompt for key if missing
                if (!deepseekKey) {
                    out.appendLine('git-autopush: No API key found, prompting user...');
                    try {
                        const entered = await vscode.window.showInputBox({ 
                            prompt: '🔑 Enter your OpenRouter API key (get free at openrouter.ai/keys)', 
                            placeHolder: 'sk-or-v1-xxxxxxxxxxxx', 
                            ignoreFocusOut: true, 
                            password: true,
                            validateInput: (value) => {
                                if (!value || value.trim().length < 20) return 'API key too short';
                                if (!value.startsWith('sk-or-')) return 'OpenRouter keys start with sk-or-';
                                return null;
                            }
                        });
                        if (typeof entered === 'string' && entered.trim()) {
                            await config.update('ai.apiKey', entered.trim(), vscode.ConfigurationTarget.Global);
                            deepseekKey = entered.trim();
                            out.appendLine('git-autopush: API key saved successfully!');
                            vscode.window.showInformationMessage('✅ API key saved!');
                        } else {
                            out.appendLine('git-autopush: User cancelled API key input');
                        }
                    }
                    catch (err) {
                        out.appendLine('git-autopush: API key save failed: ' + err?.message);
                    }
                }
                
                // Generate message if we have api key
                if (deepseekKey) {
                    out.appendLine(`git-autopush: generating AI message with ${deepseekModel}...`);
                    
                    await vscode.window.withProgress({
                        location: vscode.ProgressLocation.Notification,
                        title: "🤖 Generating commit message...",
                        cancellable: false
                    }, async () => {
                        try {
                            const https = require('https');
                            const emojiNote = useEmoji ? 'Start with a relevant emoji.' : '';
                            const systemPrompt = `You write git commit messages. Rules:
1. Max 50 characters
2. Imperative mood (Add, Fix, Update, Remove)
3. No period at end
4. ${emojiNote}
5. Be specific about what changed

Reply with ONLY the commit message, nothing else.`;
                            
                            let diffText = '';
                            try {
                                require('child_process').execSync('git add -A', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] });
                                diffText = require('child_process').execSync('git diff --cached --no-color --unified=3', { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
                            }
                            catch (e) {
                                try {
                                    diffText = require('child_process').execSync(`git diff --no-color -- "${rel}"`, { cwd: repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
                                }
                                catch (e2) {
                                    diffText = doc.getText().slice(0, 2000);
                                }
                            }
                            
                            if (diffText.length > 8000) diffText = diffText.slice(0, 8000) + '\n...(truncated)';
                            
                            const ext = path.extname(rel).toLowerCase();
                            const fileType = { '.js': 'JavaScript', '.ts': 'TypeScript', '.py': 'Python', '.md': 'Markdown', '.json': 'JSON' }[ext] || 'code';
                            
                            const userPrompt = `Write a commit message for this diff:\n\n${diffText || 'File: ' + rel}`;
                            
                            const payload = JSON.stringify({ 
                                model: deepseekModel, 
                                messages: [
                                    { role: 'system', content: systemPrompt }, 
                                    { role: 'user', content: userPrompt }
                                ],
                                temperature: 0.3,
                                max_tokens: 200
                            });
                            
                            const suggestedRaw = await new Promise((resolve, reject) => {
                                const req = https.request({ 
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
                                }, (res) => {
                                    let data = '';
                                    res.on('data', (c) => data += c);
                                    res.on('end', () => {
                                        try {
                                            if (res.statusCode < 200 || res.statusCode >= 300) {
                                                return reject(new Error(`HTTP ${res.statusCode}`));
                                            }
                                            const json = JSON.parse(data || '{}');
                                            out.appendLine(`git-autopush: API response: ${JSON.stringify(json).slice(0, 500)}`);
                                            
                                            if (json.error) {
                                                return reject(new Error(json.error.message || 'API error'));
                                            }
                                            
                                            // Extract the commit message from response
                                            let raw = '';
                                            if (json.choices && json.choices[0]?.message?.content) {
                                                raw = json.choices[0].message.content.trim();
                                            }
                                            
                                            if (!raw) return reject(new Error('Empty response'));
                                            
                                            // Clean up - remove quotes, markdown, etc.
                                            let processed = raw
                                                .split('\n')[0]  // Take first line only
                                                .replace(/^["'`]+|["'`]+$/g, '')  // Remove quotes
                                                .replace(/^\*+|\*+$/g, '')  // Remove asterisks
                                                .replace(/^#+\s*/, '')  // Remove markdown headers
                                                .trim();
                                            
                                            // Truncate if too long
                                            if (processed.length > 72) {
                                                processed = processed.slice(0, 69) + '...';
                                            }
                                            resolve(processed);
                                        }
                                        catch (e) { 
                                            reject(new Error(`Parse error: ${e.message}`)); 
                                        }
                                    });
                                });
                                req.on('error', (e) => reject(e));
                                req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
                                req.setTimeout(15000);
                                req.write(payload);
                                req.end();
                            });
                            
                            const rawText = (suggestedRaw || '').toString().trim();
                            let reviewBefore = config.get('ai.reviewBeforeCommit', true);
                            if (triggeredBySaveKey) reviewBefore = false;
                            
                            if (!reviewBefore) {
                                message = rawText || `Saved: ${path.basename(rel)}`;
                                out.appendLine(`git-autopush: using: ${message.split(/\n/)[0]}`);
                            }
                            else {
                                const subject = rawText.split(/\n/)[0] || `Saved: ${path.basename(rel)}`;
                                const edited = await vscode.window.showInputBox({ 
                                    prompt: 'Confirm commit message', 
                                    value: subject, 
                                    ignoreFocusOut: true 
                                });
                                if (typeof edited === 'undefined') {
                                    out.appendLine('git-autopush: cancelled');
                                    return;
                                }
                                message = edited.trim() || subject;
                            }
                        }
                        catch (err) {
                            out.appendLine(`git-autopush: AI failed: ${err?.message || err}`);
                        }
                    });
                }
            }
        }
        catch (e) {
            out.appendLine(`git-autopush: AI error: ${e?.message || e}`);
        }
        
        // ═══════════════════════════════════════════════════════════════════════════
        // 🚀 EXECUTE GIT COMMANDS
        // ═══════════════════════════════════════════════════════════════════════════
        
        const commitMsgEsc = message.replace(/"/g, '\\"').replace(/\$/g, '\\$');
        const gitCmds = ['git add -A', `git commit -m "${commitMsgEsc}" || echo "nothing to commit"`];
        
        if (!dryRun && canPush) {
            gitCmds.push(`git push origin ${branch}`);
        }
        
        const cwdPrefix = workspaceFolder ? `cd "${workspaceFolder.replace(/"/g, '\\"')}" && ` : '';
        const fullCmd = cwdPrefix + gitCmds.join(' && ');
        
        out.appendLine(`git-autopush: ${fullCmd}`);
        terminal.show(true);
        
        if (!dryRun) {
            terminal.sendText(fullCmd, true);
            const stats = updateStats(message);
            storeLastCommit(workspaceFolder, message);
            
            const action = canPush ? 'Committed & pushed' : 'Committed';
            vscode.window.showInformationMessage(
                `$(git-commit) ${action}! (${stats.todayCommits} today, 🔥${stats.streak})`,
                'View Log'
            ).then(sel => { if (sel === 'View Log') out.show(); });
        }
        else {
            out.appendLine('git-autopush: dry run — not executing');
            out.show(true);
        }
        
        updateStatusBar();
        context.workspaceState.update('gitAutopush.lastAction', new Date().toISOString());
    });
    context.subscriptions.push(onSave);
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 📋 QUICK ACTIONS MENU
    // ═══════════════════════════════════════════════════════════════════════════════
    
    const quickActionsCmd = vscode.commands.registerCommand('git-autopush.showQuickActions', async () => {
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const autoCommit = cfg.get('autoCommit', false);
        const autoPush = cfg.get('autoPush', false);
        const dryRun = cfg.get('dryRun', true);
        const stats = getStats();
        const apiKey = cfg.get('ai.apiKey', '');
        const hasKey = apiKey && apiKey.length > 10;
        
        const items = [
            { label: `$(git-commit) Auto Commit: ${autoCommit ? 'ON ✅' : 'OFF'}`, description: 'Toggle auto commits', action: 'toggleCommit' },
            { label: `$(cloud-upload) Auto Push: ${autoPush ? 'ON ✅' : 'OFF'}`, description: 'Toggle auto push', action: 'togglePush' },
            { label: `$(beaker) Dry Run: ${dryRun ? 'ON 🧪' : 'OFF'}`, description: 'Toggle dry run mode', action: 'toggleDry' },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: '$(play) Run Once Now', description: 'Commit now', action: 'runOnce' },
            { label: '$(discard) Undo Last Commit', description: lastCommitInfo ? `Undo: ${lastCommitInfo.message.slice(0,30)}...` : 'No commit to undo', action: 'undo' },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: '$(graph) View Stats', description: `${stats.totalCommits} commits, ${stats.streak} day streak`, action: 'stats' },
            { label: '$(history) Commit History', description: 'Recent commits', action: 'history' },
            { label: `$(key) API Key: ${hasKey ? '✅ Set' : '❌ Missing'}`, description: hasKey ? 'Key configured' : 'Click to add key', action: 'apiKey' },
            { label: '$(output) View Debug Log', description: 'Open debug output', action: 'log' },
        ];
        
        const selected = await vscode.window.showQuickPick(items, { placeHolder: '🚀 Git AutoPush - Quick Actions' });
        if (!selected) return;
        
        switch (selected.action) {
            case 'toggleCommit':
                await cfg.update('autoCommit', !autoCommit, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`Auto Commit: ${!autoCommit ? 'ON' : 'OFF'}`);
                break;
            case 'togglePush':
                await cfg.update('autoPush', !autoPush, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`Auto Push: ${!autoPush ? 'ON' : 'OFF'}`);
                break;
            case 'toggleDry':
                await cfg.update('dryRun', !dryRun, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`Dry Run: ${!dryRun ? 'ON' : 'OFF'}`);
                break;
            case 'runOnce': vscode.commands.executeCommand('git-autopush.runOnce'); break;
            case 'undo': vscode.commands.executeCommand('git-autopush.undoLastCommit'); break;
            case 'stats': vscode.commands.executeCommand('git-autopush.showStats'); break;
            case 'history': vscode.commands.executeCommand('git-autopush.showHistory'); break;
            case 'apiKey': vscode.commands.executeCommand('git-autopush.setApiKey'); break;
            case 'log': out.show(); break;
        }
        updateStatusBar();
    });
    context.subscriptions.push(quickActionsCmd);
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 📊 SHOW STATS COMMAND
    // ═══════════════════════════════════════════════════════════════════════════════
    
    const showStatsCmd = vscode.commands.registerCommand('git-autopush.showStats', async () => {
        const stats = getStats();
        const allAch = [
            { id: 'first_commit', name: '🎉 First Commit' },
            { id: 'ten_commits', name: '🔟 10 Commits' },
            { id: 'fifty_commits', name: '🎯 50 Commits' },
            { id: 'hundred_commits', name: '💯 100 Commits' },
            { id: 'streak_3', name: '🔥 3 Day Streak' },
            { id: 'streak_7', name: '🌟 Week Warrior' },
            { id: 'streak_30', name: '👑 Monthly Master' },
            { id: 'productive_day', name: '⚡ Super Productive' },
        ];
        
        const earned = allAch.filter(a => stats.achievements.includes(a.id)).map(a => a.name);
        const locked = allAch.filter(a => !stats.achievements.includes(a.id)).map(a => `🔒 ${a.name}`);
        
        const panel = vscode.window.createWebviewPanel('gitAutopushStats', '📊 Git AutoPush Stats', vscode.ViewColumn.One, {});
        
        panel.webview.html = `<!DOCTYPE html>
<html><head><style>
body { font-family: var(--vscode-font-family); padding: 20px; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); }
.stat { font-size: 48px; text-align: center; margin: 20px 0; }
.label { font-size: 14px; color: var(--vscode-descriptionForeground); text-align: center; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 30px 0; }
.card { background: var(--vscode-input-background); padding: 20px; border-radius: 8px; text-align: center; }
.badge { display: inline-block; padding: 5px 10px; margin: 5px; border-radius: 15px; background: var(--vscode-badge-background); }
.locked { opacity: 0.5; }
h2 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
</style></head>
<body>
<h1>📊 Your Git AutoPush Stats</h1>
<div class="grid">
<div class="card"><div class="stat">${stats.totalCommits}</div><div class="label">Total Commits</div></div>
<div class="card"><div class="stat">🔥 ${stats.streak}</div><div class="label">Current Streak</div></div>
<div class="card"><div class="stat">⭐ ${stats.longestStreak}</div><div class="label">Longest Streak</div></div>
</div>
<div class="card"><div class="stat">${stats.todayCommits}</div><div class="label">Commits Today</div></div>
<div class="achievements"><h2>🏆 Achievements (${earned.length}/${allAch.length})</h2>
<div>${earned.map(a => `<span class="badge">${a}</span>`).join('')}${locked.map(a => `<span class="badge locked">${a}</span>`).join('')}</div>
</div>
</body></html>`;
    });
    context.subscriptions.push(showStatsCmd);
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 📜 SHOW HISTORY COMMAND
    // ═══════════════════════════════════════════════════════════════════════════════
    
    const showHistoryCmd = vscode.commands.registerCommand('git-autopush.showHistory', async () => {
        const stats = getStats();
        if (stats.commitHistory.length === 0) {
            vscode.window.showInformationMessage('No commit history yet!');
            return;
        }
        const items = stats.commitHistory.map((c, i) => ({
            label: `${i + 1}. ${c.message}`,
            description: new Date(c.timestamp).toLocaleString()
        }));
        await vscode.window.showQuickPick(items, { placeHolder: '📜 Recent Commits' });
    });
    context.subscriptions.push(showHistoryCmd);
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // ↩️ UNDO LAST COMMIT
    // ═══════════════════════════════════════════════════════════════════════════════
    
    const undoLastCommitCmd = vscode.commands.registerCommand('git-autopush.undoLastCommit', async () => {
        if (!lastCommitInfo) {
            vscode.window.showWarningMessage('No recent commit to undo');
            return;
        }
        
        try {
            const currentHead = require('child_process')
                .execSync('git rev-parse HEAD', { cwd: lastCommitInfo.workspace, stdio: ['ignore', 'pipe', 'ignore'] })
                .toString().trim();
            
            if (currentHead !== lastCommitInfo.hash) {
                vscode.window.showWarningMessage('HEAD has changed - cannot undo');
                return;
            }
        } catch (e) {
            vscode.window.showErrorMessage('Failed to verify commit');
            return;
        }
        
        const confirm = await vscode.window.showWarningMessage(
            `Undo: "${lastCommitInfo.message.slice(0, 50)}..."?`,
            { modal: true },
            'Soft Reset (keep changes)',
            'Hard Reset (discard)'
        );
        
        if (!confirm) return;
        
        const resetType = confirm.includes('Hard') ? '--hard' : '--soft';
        const cmd = `cd "${lastCommitInfo.workspace}" && git reset ${resetType} HEAD~1`;
        
        terminal.show(true);
        terminal.sendText(cmd, true);
        vscode.window.showInformationMessage(`Commit undone (${resetType.replace('--', '')})`);
        lastCommitInfo = null;
        updateStatusBar();
    });
    context.subscriptions.push(undoLastCommitCmd);
    
    // ═══════════════════════════════════════════════════════════════════════════════
    // 🔧 OTHER COMMANDS
    // ═══════════════════════════════════════════════════════════════════════════════
    
    const toggleAutoCommit = vscode.commands.registerCommand('git-autopush.toggleAutoCommit', async () => {
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const cur = cfg.get('autoCommit', false);
        await cfg.update('autoCommit', !cur, vscode.ConfigurationTarget.Workspace);
        updateStatusBar();
        vscode.window.showInformationMessage(`Auto Commit: ${!cur ? 'ON' : 'OFF'}`);
    });
    context.subscriptions.push(toggleAutoCommit);
    
    const toggleAutoPush = vscode.commands.registerCommand('git-autopush.toggleAutoPush', async () => {
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const cur = cfg.get('autoPush', false);
        await cfg.update('autoPush', !cur, vscode.ConfigurationTarget.Workspace);
        updateStatusBar();
        vscode.window.showInformationMessage(`Auto Push: ${!cur ? 'ON' : 'OFF'}`);
    });
    context.subscriptions.push(toggleAutoPush);
    
    const setApiKeyCmd = vscode.commands.registerCommand('git-autopush.setApiKey', async () => {
        // Show helpful message first
        const action = await vscode.window.showInformationMessage(
            '🔑 You need an OpenRouter API key (free)',
            'Get Free Key',
            'I have a key'
        );
        
        if (action === 'Get Free Key') {
            vscode.env.openExternal(vscode.Uri.parse('https://openrouter.ai/keys'));
            vscode.window.showInformationMessage('After getting your key, run this command again to enter it');
            return;
        }
        
        if (action !== 'I have a key') return;
        
        try {
            const value = await vscode.window.showInputBox({ 
                prompt: 'Paste your OpenRouter API key here', 
                placeHolder: 'sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx', 
                ignoreFocusOut: true, 
                password: true,
                validateInput: (v) => {
                    if (!v || v.trim().length < 20) return 'Key is too short';
                    if (!v.startsWith('sk-or-')) return 'OpenRouter keys start with sk-or-';
                    return null;
                }
            });
            if (typeof value === 'string' && value.trim()) {
                // Save to Global (User) settings - more reliable than Machine
                await vscode.workspace.getConfiguration('gitAutopush').update('ai.apiKey', value.trim(), vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('✅ API key saved! Now press Ctrl+S to test.');
                out.appendLine('git-autopush: API key saved to user settings');
            }
        }
        catch (e) {
            vscode.window.showErrorMessage('Failed to save API key: ' + e?.message);
            out.appendLine('git-autopush: Failed to save API key: ' + e?.message);
        }
    });
    context.subscriptions.push(setApiKeyCmd);
    
    const generateMessageCmd = vscode.commands.registerCommand('git-autopush.generateMessage', async () => {
        vscode.window.showInformationMessage('Use Ctrl+S to generate AI commit messages');
    });
    context.subscriptions.push(generateMessageCmd);
    
    const debugDeepseekCmd = vscode.commands.registerCommand('git-autopush.debugDeepseek', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showWarningMessage('No active editor'); return; }
        
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const key = cfg.get('ai.apiKey', '') || cfg.get('ai.deepseekApiKey', '') || process.env.DEEPSEEK_API_KEY || '';
        const model = cfg.get('ai.deepseekModel', 'deepseek/deepseek-r1-0528:free');
        
        if (!key) { vscode.window.showWarningMessage('No API key'); return; }
        
        out.appendLine('Debug API call...');
        out.show(true);
        
        try {
            const https = require('https');
            const doc = editor.document;
            const excerpt = doc.getText().slice(0, 1000);
            const payload = JSON.stringify({ model, messages: [{ role: 'user', content: `Summarize: ${excerpt}` }] });
            
            const raw = await new Promise((resolve, reject) => {
                const req = https.request({
                    hostname: 'openrouter.ai', port: 443, path: '/api/v1/chat/completions', method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), 'Authorization': `Bearer ${key}` }
                }, (res) => {
                    let data = '';
                    res.on('data', (c) => data += c);
                    res.on('end', () => resolve(data));
                });
                req.on('error', reject);
                req.setTimeout(15000);
                req.write(payload);
                req.end();
            });
            
            out.appendLine('Response:');
            try { out.appendLine(JSON.stringify(JSON.parse(raw), null, 2)); } catch (e) { out.appendLine(raw); }
        }
        catch (e) {
            out.appendLine('Failed: ' + (e?.message || e));
        }
    });
    context.subscriptions.push(debugDeepseekCmd);
    
    const pauseCmd = vscode.commands.registerCommand('git-autopush.pause', async () => {
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const cur = cfg.get('autoCommit', false);
        await cfg.update('autoCommit', !cur, vscode.ConfigurationTarget.Workspace);
        updateStatusBar();
        vscode.window.showInformationMessage(`Git AutoPush: ${!cur ? 'Resumed' : 'Paused'}`);
    });
    context.subscriptions.push(pauseCmd);
    
    const runOnceCmd = vscode.commands.registerCommand('git-autopush.runOnce', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) { vscode.window.showWarningMessage('No active editor'); return; }
        
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const dryRun = cfg.get('dryRun', true);
        const autoPush = cfg.get('autoPush', false);
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const rel = workspaceFolder ? path.relative(workspaceFolder, editor.document.uri.fsPath) : editor.document.uri.fsPath;
        
        let branch = 'HEAD';
        try { branch = require('child_process').execSync('git symbolic-ref --short HEAD', { cwd: workspaceFolder, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { }
        
        const message = `Manual: ${path.basename(rel)}`;
        const gitCmds = ['git add -A', `git commit -m "${message.replace(/"/g, '\\"')}" || echo "nothing to commit"`];
        if (!dryRun && autoPush) gitCmds.push(`git push origin ${branch}`);
        
        const cmd = workspaceFolder ? `cd "${workspaceFolder}" && ${gitCmds.join(' && ')}` : gitCmds.join(' && ');
        
        terminal.show(true);
        if (!dryRun) {
            terminal.sendText(cmd, true);
            updateStats(message);
            vscode.window.showInformationMessage('Manual commit done');
        } else {
            out.appendLine('Dry run: ' + cmd);
            out.show();
        }
        updateStatusBar();
    });
    context.subscriptions.push(runOnceCmd);
    
    const saveAndRunCmd = vscode.commands.registerCommand('git-autopush.saveAndRun', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            await vscode.commands.executeCommand('workbench.action.files.save');
            return;
        }
        const docPath = editor.document.uri.fsPath;
        const expires = Date.now() + 5000;
        const nonce = Math.random().toString(36).slice(2);
        await context.workspaceState.update('gitAutopush.triggeredBySaveKeyFor', { path: docPath, nonce, expires });
        triggerNonces.set(docPath, nonce);
        out.appendLine(`git-autopush: saveAndRun for ${docPath}`);
        await vscode.commands.executeCommand('workbench.action.files.save');
    });
    context.subscriptions.push(saveAndRunCmd);
    
    // Startup message
    const stats = getStats();
    if (stats.streak > 0) {
        out.appendLine(`git-autopush: Welcome! 🔥 ${stats.streak} day streak, ${stats.totalCommits} total commits`);
    }
    
    context.subscriptions.push(statusBar);
    out.appendLine('git-autopush: Extension activated ✅');
}

exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map
