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
        
        // Get AI settings for display
        const commitStyle = cfg.get('ai.commitStyle', 'auto');
        const conventionalCommits = cfg.get('ai.conventionalCommits', true);
        const includeScope = cfg.get('ai.includeScope', true);
        const baseBranch = cfg.get('pr.baseBranch', 'main');

        const styleLabels = { auto: 'Auto', concise: 'Short', detailed: 'Detailed' };

        const items = [
            { label: `$(git-commit) Auto Commit: ${autoCommit ? 'On' : 'Off'}`, description: 'Toggle auto commits', action: 'toggleCommit' },
            { label: `$(cloud-upload) Auto Push: ${autoPush ? 'On' : 'Off'}`, description: 'Toggle auto push', action: 'togglePush' },
            { label: `$(beaker) Dry Run: ${dryRun ? 'On' : 'Off'}`, description: 'Toggle dry run mode', action: 'toggleDry' },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: '$(play) Run Once Now', description: 'Execute commit now', action: 'runOnce' },
            { label: '$(discard) Undo Last Commit', description: state.lastCommitInfo ? `Undo: ${state.lastCommitInfo.message.slice(0,30)}...` : 'No commit to undo', action: 'undo' },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: '$(git-pull-request) Generate PR Description', description: `Compare against: ${baseBranch}`, action: 'generatePR' },
            { label: '$(clippy) Copy PR to Clipboard', description: 'Quick copy PR description', action: 'copyPR' },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: `$(edit) Commit Style: ${styleLabels[commitStyle]}`, description: 'Change message length style', action: 'changeStyle' },
            { label: `$(list-ordered) Conventional Commits: ${conventionalCommits ? 'On' : 'Off'}`, description: 'Toggle feat:/fix: prefixes', action: 'toggleConventional' },
            { label: `$(symbol-namespace) Include Scope: ${includeScope ? 'On' : 'Off'}`, description: 'Toggle (auth): (api): in messages', action: 'toggleScope' },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: '$(graph) View Statistics', description: `${stats.totalCommits} commits`, action: 'stats' },
            { label: '$(history) Commit History', description: 'View recent commits', action: 'history' },
            { label: `$(key) API Key: ${hasKey ? 'Configured' : 'Missing'}`, description: hasKey ? 'OpenRouter key set' : 'Click to configure', action: 'apiKey' },
            { label: '$(terminal) Debug Output', description: 'View extension logs', action: 'log' },
        ];

        const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Git AutoPush - Quick Actions' });
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
            case 'generatePR': vscode.commands.executeCommand('git-autopush.generatePR'); break;
            case 'copyPR': vscode.commands.executeCommand('git-autopush.copyPRToClipboard'); break;
            case 'changeStyle':
                const styles = [
                    { label: 'Auto', description: 'AI picks based on change size', value: 'auto' },
                    { label: 'Concise', description: 'Always short one-liners', value: 'concise' },
                    { label: 'Detailed', description: 'Always include body with bullets', value: 'detailed' }
                ];
                const picked = await vscode.window.showQuickPick(styles, { placeHolder: 'Select commit message style' });
                if (picked) {
                    await cfg.update('ai.commitStyle', picked.value, vscode.ConfigurationTarget.Workspace);
                    vscode.window.showInformationMessage(`Commit Style: ${picked.label}`);
                }
                break;
            case 'toggleConventional':
                await cfg.update('ai.conventionalCommits', !conventionalCommits, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`Conventional Commits: ${!conventionalCommits ? 'ON' : 'OFF'}`);
                break;
            case 'toggleScope':
                await cfg.update('ai.includeScope', !includeScope, vscode.ConfigurationTarget.Workspace);
                vscode.window.showInformationMessage(`Include Scope: ${!includeScope ? 'ON' : 'OFF'}`);
                break;
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
            'OpenRouter API key required (free tier available)',
            'Get API Key',
            'Enter Key'
        );

        if (action === 'Get API Key') {
            vscode.env.openExternal(vscode.Uri.parse('https://openrouter.ai/keys'));
            vscode.window.showInformationMessage('Get your key from OpenRouter, then run this command again');
            return;
        }

        if (action !== 'Enter Key') return;

        try {
            const value = await vscode.window.showInputBox({
                prompt: 'Enter your OpenRouter API key',
                placeHolder: 'sk-or-v1-...',
                ignoreFocusOut: true,
                password: true,
                validateInput: (v) => aiService.validateApiKey(v)
            });

            if (typeof value === 'string' && value.trim()) {
                await vscode.workspace.getConfiguration('gitAutopush')
                    .update('ai.apiKey', value.trim(), vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage('API key saved successfully');
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

    // =========================================================================
    // PR GENERATION COMMANDS
    // =========================================================================

    const { createPRGenerator } = require('./pr-generator');
    const prGenerator = createPRGenerator(outputChannel);

    const generatePRCmd = vscode.commands.registerCommand('git-autopush.generatePR', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('No workspace folder open');
            return;
        }

        const repoRoot = gitOps.getRepoRoot(workspaceFolder);
        if (!repoRoot) {
            vscode.window.showWarningMessage('Not a git repository');
            return;
        }

        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const defaultBaseBranch = cfg.get('pr.baseBranch', 'main');
        const apiKey = cfg.get('ai.apiKey', '') || cfg.get('ai.deepseekApiKey', '');
        const model = cfg.get('ai.deepseekModel', 'deepseek/deepseek-chat');
        const useEmoji = cfg.get('useEmoji', true);

        if (!apiKey) {
            const action = await vscode.window.showWarningMessage(
                'API key required for AI-generated PR descriptions',
                'Set API Key',
                'Generate Basic'
            );
            if (action === 'Set API Key') {
                vscode.commands.executeCommand('git-autopush.setApiKey');
                return;
            }
            if (!action) return;
        }

        // Let user select base branch
        const baseBranch = await vscode.window.showInputBox({
            prompt: 'Enter base branch to compare against',
            value: defaultBaseBranch,
            placeHolder: 'main, master, develop...'
        });

        if (!baseBranch) return;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating PR description...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Analyzing commits...' });

            try {
                const result = await prGenerator.generatePRDescription(aiService, {
                    repoRoot,
                    baseBranch,
                    apiKey,
                    model,
                    useEmoji
                });

                if (result.error && !result.description) {
                    vscode.window.showErrorMessage(`PR generation failed: ${result.error}`);
                    return;
                }

                // Show result in a new document
                const content = result.title 
                    ? `# ${result.title}\n\n${result.description}`
                    : result.description;

                const doc = await vscode.workspace.openTextDocument({
                    content,
                    language: 'markdown'
                });
                await vscode.window.showTextDocument(doc, { preview: true });

                // Offer to copy to clipboard
                const action = await vscode.window.showInformationMessage(
                    'PR description generated!',
                    'Copy to Clipboard',
                    'Close'
                );

                if (action === 'Copy to Clipboard') {
                    await vscode.env.clipboard.writeText(content);
                    vscode.window.showInformationMessage('PR description copied to clipboard');
                }

            } catch (e) {
                out.appendLine(`git-autopush: PR generation error: ${e.message}`);
                vscode.window.showErrorMessage(`PR generation failed: ${e.message}`);
            }
        });
    });
    context.subscriptions.push(generatePRCmd);

    const copyPRCmd = vscode.commands.registerCommand('git-autopush.copyPRToClipboard', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('No workspace folder open');
            return;
        }

        const repoRoot = gitOps.getRepoRoot(workspaceFolder);
        if (!repoRoot) {
            vscode.window.showWarningMessage('Not a git repository');
            return;
        }

        const cfg = vscode.workspace.getConfiguration('gitAutopush');
        const baseBranch = cfg.get('pr.baseBranch', 'main');
        const apiKey = cfg.get('ai.apiKey', '') || cfg.get('ai.deepseekApiKey', '');
        const model = cfg.get('ai.deepseekModel', 'deepseek/deepseek-chat');
        const useEmoji = cfg.get('useEmoji', true);

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Generating PR description...",
            cancellable: false
        }, async () => {
            try {
                const result = await prGenerator.generatePRDescription(aiService, {
                    repoRoot,
                    baseBranch,
                    apiKey,
                    model,
                    useEmoji
                });

                const content = result.title 
                    ? `# ${result.title}\n\n${result.description}`
                    : result.description;

                await vscode.env.clipboard.writeText(content);
                vscode.window.showInformationMessage('PR description copied to clipboard!');

            } catch (e) {
                out.appendLine(`git-autopush: PR copy error: ${e.message}`);
                vscode.window.showErrorMessage(`Failed: ${e.message}`);
            }
        });
    });
    context.subscriptions.push(copyPRCmd);
}

module.exports = { registerCommands };

