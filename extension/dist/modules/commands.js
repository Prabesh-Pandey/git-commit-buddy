"use strict";
/**
 * ⌨️ COMMANDS MODULE
 * Registers all VS Code commands for the extension
 */

const vscode = require("vscode");
const path = require("path");

/**
 * Register all extension commands
 * @param {object} deps - Dependencies
 * @param {vscode.ExtensionContext} deps.context - Extension context
 * @param {object} deps.statsManager - Stats manager instance
 * @param {object} deps.uiManager - UI manager instance
 * @param {object} deps.gitOps - Git operations instance
 * @param {object} deps.aiService - AI service instance
 * @param {vscode.Terminal} deps.terminal - Terminal instance
 * @param {vscode.OutputChannel} deps.outputChannel - Output channel
 * @param {object} deps.state - Shared state object
 */
function registerCommands(deps) {
    const { 
        context, 
        statsManager, 
        uiManager, 
        gitOps, 
        aiService, 
        terminal, 
        outputChannel,
        state 
    } = deps;
    
    const out = outputChannel;

    // ═══════════════════════════════════════════════════════════════════════════
    // 📋 QUICK ACTIONS MENU
    // ═══════════════════════════════════════════════════════════════════════════

    const quickActionsCmd = vscode.commands.registerCommand('git-autopush.showQuickActions', async () => {
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const autoCommit = cfg.get('autoCommit', false);
        const autoPush = cfg.get('autoPush', false);
        const dryRun = cfg.get('dryRun', true);
        const stats = statsManager.getStats();
        const apiKey = cfg.get('ai.apiKey', '');
        const hasKey = apiKey && apiKey.length > 10;

        const items = [
            { label: `$(git-commit) Auto Commit: ${autoCommit ? 'ON ✅' : 'OFF'}`, description: 'Toggle auto commits', action: 'toggleCommit' },
            { label: `$(cloud-upload) Auto Push: ${autoPush ? 'ON ✅' : 'OFF'}`, description: 'Toggle auto push', action: 'togglePush' },
            { label: `$(beaker) Dry Run: ${dryRun ? 'ON 🧪' : 'OFF'}`, description: 'Toggle dry run mode', action: 'toggleDry' },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: '$(play) Run Once Now', description: 'Commit now', action: 'runOnce' },
            { label: '$(discard) Undo Last Commit', description: state.lastCommitInfo ? `Undo: ${state.lastCommitInfo.message.slice(0,30)}...` : 'No commit to undo', action: 'undo' },
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
        uiManager.updateStatusBar();
    });
    context.subscriptions.push(quickActionsCmd);

    // ═══════════════════════════════════════════════════════════════════════════
    // 📊 SHOW STATS
    // ═══════════════════════════════════════════════════════════════════════════

    const showStatsCmd = vscode.commands.registerCommand('git-autopush.showStats', async () => {
        const stats = statsManager.getStats();
        const achievements = statsManager.getAllAchievements();
        uiManager.showStatsPanel(stats, achievements);
    });
    context.subscriptions.push(showStatsCmd);

    // ═══════════════════════════════════════════════════════════════════════════
    // 📜 SHOW HISTORY
    // ═══════════════════════════════════════════════════════════════════════════

    const showHistoryCmd = vscode.commands.registerCommand('git-autopush.showHistory', async () => {
        const stats = statsManager.getStats();
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

    // ═══════════════════════════════════════════════════════════════════════════
    // ↩️ UNDO LAST COMMIT
    // ═══════════════════════════════════════════════════════════════════════════

    const undoLastCommitCmd = vscode.commands.registerCommand('git-autopush.undoLastCommit', async () => {
        if (!state.lastCommitInfo) {
            vscode.window.showWarningMessage('No recent commit to undo');
            return;
        }

        const currentHead = gitOps.getHeadCommit(state.lastCommitInfo.workspace);
        if (currentHead !== state.lastCommitInfo.hash) {
            vscode.window.showWarningMessage('HEAD has changed - cannot undo');
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Undo: "${state.lastCommitInfo.message.slice(0, 50)}..."?`,
            { modal: true },
            'Soft Reset (keep changes)',
            'Hard Reset (discard)'
        );

        if (!confirm) return;

        const resetType = confirm.includes('Hard') ? 'hard' : 'soft';
        const cmd = gitOps.buildResetCommand(state.lastCommitInfo.workspace, resetType);

        terminal.show(true);
        terminal.sendText(cmd, true);
        vscode.window.showInformationMessage(`Commit undone (${resetType})`);
        state.lastCommitInfo = null;
        uiManager.updateStatusBar();
    });
    context.subscriptions.push(undoLastCommitCmd);

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔧 TOGGLE COMMANDS
    // ═══════════════════════════════════════════════════════════════════════════

    const toggleAutoCommit = vscode.commands.registerCommand('git-autopush.toggleAutoCommit', async () => {
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const cur = cfg.get('autoCommit', false);
        await cfg.update('autoCommit', !cur, vscode.ConfigurationTarget.Workspace);
        uiManager.updateStatusBar();
        vscode.window.showInformationMessage(`Auto Commit: ${!cur ? 'ON' : 'OFF'}`);
    });
    context.subscriptions.push(toggleAutoCommit);

    const toggleAutoPush = vscode.commands.registerCommand('git-autopush.toggleAutoPush', async () => {
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const cur = cfg.get('autoPush', false);
        await cfg.update('autoPush', !cur, vscode.ConfigurationTarget.Workspace);
        uiManager.updateStatusBar();
        vscode.window.showInformationMessage(`Auto Push: ${!cur ? 'ON' : 'OFF'}`);
    });
    context.subscriptions.push(toggleAutoPush);

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔑 SET API KEY
    // ═══════════════════════════════════════════════════════════════════════════

    const setApiKeyCmd = vscode.commands.registerCommand('git-autopush.setApiKey', async () => {
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
                validateInput: (v) => aiService.validateApiKey(v)
            });

            if (typeof value === 'string' && value.trim()) {
                await vscode.workspace.getConfiguration('gitAutopush')
                    .update('ai.apiKey', value.trim(), vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('✅ API key saved! Now press Ctrl+S to test.');
                out.appendLine('git-autopush: API key saved to user settings');
            }
        } catch (e) {
            vscode.window.showErrorMessage('Failed to save API key: ' + e?.message);
            out.appendLine('git-autopush: Failed to save API key: ' + e?.message);
        }
    });
    context.subscriptions.push(setApiKeyCmd);

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎮 OTHER COMMANDS
    // ═══════════════════════════════════════════════════════════════════════════

    const generateMessageCmd = vscode.commands.registerCommand('git-autopush.generateMessage', async () => {
        vscode.window.showInformationMessage('Use Ctrl+S to generate AI commit messages');
    });
    context.subscriptions.push(generateMessageCmd);

    const pauseCmd = vscode.commands.registerCommand('git-autopush.pause', async () => {
        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const cur = cfg.get('autoCommit', false);
        await cfg.update('autoCommit', !cur, vscode.ConfigurationTarget.Workspace);
        uiManager.updateStatusBar();
        vscode.window.showInformationMessage(`Git AutoPush: ${!cur ? 'Resumed' : 'Paused'}`);
    });
    context.subscriptions.push(pauseCmd);

    const runOnceCmd = vscode.commands.registerCommand('git-autopush.runOnce', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const dryRun = cfg.get('dryRun', true);
        const autoPush = cfg.get('autoPush', false);
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        const rel = workspaceFolder 
            ? path.relative(workspaceFolder, editor.document.uri.fsPath) 
            : editor.document.uri.fsPath;

        const branch = gitOps.getCurrentBranch(workspaceFolder) || 'HEAD';
        const message = `Manual: ${path.basename(rel)}`;

        const cmd = gitOps.buildCommitCommand({
            workspaceFolder,
            message,
            branch,
            push: !dryRun && autoPush
        });

        terminal.show(true);
        if (!dryRun) {
            terminal.sendText(cmd, true);
            statsManager.updateStats(message);
            vscode.window.showInformationMessage('Manual commit done');
        } else {
            out.appendLine('Dry run: ' + cmd);
            out.show();
        }
        uiManager.updateStatusBar();
    });
    context.subscriptions.push(runOnceCmd);

    const debugDeepseekCmd = vscode.commands.registerCommand('git-autopush.debugDeepseek', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const key = cfg.get('ai.apiKey', '') || cfg.get('ai.deepseekApiKey', '');
        const model = cfg.get('ai.deepseekModel', 'deepseek/deepseek-chat');

        if (!key) {
            vscode.window.showWarningMessage('No API key');
            return;
        }

        out.appendLine('Testing API connection...');
        out.show(true);

        const success = await aiService.testConnection(key, model);
        if (success) {
            out.appendLine('✅ API connection successful!');
            vscode.window.showInformationMessage('API connection successful!');
        } else {
            out.appendLine('❌ API connection failed');
            vscode.window.showErrorMessage('API connection failed - check debug log');
        }
    });
    context.subscriptions.push(debugDeepseekCmd);

    const saveAndRunCmd = vscode.commands.registerCommand('git-autopush.saveAndRun', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            await vscode.commands.executeCommand('workbench.action.files.save');
            return;
        }

        const docPath = editor.document.uri.fsPath;
        const expires = Date.now() + 5000;
        const nonce = Math.random().toString(36).slice(2);

        await context.workspaceState.update('gitAutopush.triggeredBySaveKeyFor', { 
            path: docPath, 
            nonce, 
            expires 
        });
        state.triggerNonces.set(docPath, nonce);

        out.appendLine(`git-autopush: saveAndRun for ${docPath}`);
        await vscode.commands.executeCommand('workbench.action.files.save');
    });
    context.subscriptions.push(saveAndRunCmd);
}

module.exports = { registerCommands };
