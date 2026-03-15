"use strict";
/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🚀 GIT AUTOPUSH ON SAVE - MODULAR EDITION
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Main extension entry point. This file orchestrates all modules:
 * - stats.js       → Commit statistics & gamification
 * - ai-service.js  → AI-powered commit message generation
 * - git-operations.js → Git commands and operations
 * - ui.js          → Status bar and visual elements
 * - commands.js    → All registered VS Code commands
 * 
 * @author Git AutoPush Team
 * @version 2.0.0
 */

Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;

const vscode = require("vscode");
const path = require("path");
const minimatch = require("minimatch");

// Import modules
const { createStatsManager } = require("./modules/stats");
const { createAIService } = require("./modules/ai-service");
const { createGitOperations } = require("./modules/git-operations");
const { createUIManager } = require("./modules/ui");
const { registerCommands } = require("./modules/commands");
const { getSmartMessageWithFile, stripEmoji } = require("./modules/message-picker");

/**
 * Extension activation
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    // ═══════════════════════════════════════════════════════════════════════════
    // 🔧 INITIALIZE CORE COMPONENTS
    // ═══════════════════════════════════════════════════════════════════════════
    
    const terminal = vscode.window.createTerminal('git-autopush');
    const outputChannel = vscode.window.createOutputChannel('git-autopush-debug');
    
    outputChannel.appendLine('git-autopush: Initializing modules...');

    // Initialize modules
    const statsManager = createStatsManager(context);
    const aiService = createAIService(outputChannel);
    const gitOps = createGitOperations(outputChannel);
    const uiManager = createUIManager({ 
        getStats: statsManager.getStats, 
        outputChannel 
    });

    // Shared state (mutable, passed by reference)
    const state = {
        triggerNonces: new Map(),
        lastCommitInfo: null
    };

    // Register all commands
    registerCommands({
        context,
        statsManager,
        uiManager,
        gitOps,
        aiService,
        terminal,
        outputChannel,
        state
    });

    // Initialize status bar
    uiManager.updateStatusBar();
    context.subscriptions.push(uiManager.getStatusBarItem());

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔄 DEPRECATED KEY MIGRATION
    // ═══════════════════════════════════════════════════════════════════════════

    const migrationConfig = vscode.workspace.getConfiguration('gitAutopush');
    const oldKey = migrationConfig.get('ai.deepseekApiKey', '');
    const newKey = migrationConfig.get('ai.apiKey', '');

    if (oldKey && !newKey) {
        // Auto-migrate: copy old key to new setting and clear the old one
        migrationConfig.update('ai.apiKey', oldKey, vscode.ConfigurationTarget.Global).then(() => {
            migrationConfig.update('ai.deepseekApiKey', '', vscode.ConfigurationTarget.Global);
            outputChannel.appendLine('git-autopush: Migrated deprecated ai.deepseekApiKey → ai.apiKey');
            vscode.window.showInformationMessage(
                'Git AutoPush: Your API key has been migrated from the deprecated "deepseekApiKey" to "apiKey". No action needed.'
            );
        });
    } else if (oldKey && newKey) {
        // Both set — warn the user and log which one is being used
        outputChannel.appendLine(
            'git-autopush: WARNING — both ai.apiKey and deprecated ai.deepseekApiKey are set. Using ai.apiKey.'
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 💾 MAIN SAVE HANDLER
    // ═══════════════════════════════════════════════════════════════════════════

    const onSave = vscode.workspace.onDidSaveTextDocument(async (doc) => {
        await handleSave(doc, {
            context,
            statsManager,
            aiService,
            gitOps,
            uiManager,
            terminal,
            outputChannel,
            state
        });
    });
    context.subscriptions.push(onSave);

    // ═══════════════════════════════════════════════════════════════════════════
    // 🎉 STARTUP MESSAGE
    // ═══════════════════════════════════════════════════════════════════════════

    const stats = statsManager.getStats();
    if (stats.streak > 0) {
        outputChannel.appendLine(
            `git-autopush: Welcome! 🔥 ${stats.streak} day streak, ${stats.totalCommits} total commits`
        );
    }

    outputChannel.appendLine('git-autopush: Extension activated ✅');
}

/**
 * Handle document save event
 * @param {vscode.TextDocument} doc - Saved document
 * @param {object} deps - Dependencies
 */
async function handleSave(doc, deps) {
    const { 
        context, 
        statsManager, 
        aiService, 
        gitOps, 
        uiManager, 
        terminal, 
        outputChannel,
        state 
    } = deps;
    
    const out = outputChannel;

    // ═══════════════════════════════════════════════════════════════════════════
    // 🔐 VALIDATE TRIGGER TOKEN
    // ═══════════════════════════════════════════════════════════════════════════

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

    // Validate nonce
    const expectedNonce = token.nonce || null;
    const currentNonce = state.triggerNonces.get(doc.uri.fsPath) || null;
    if (!expectedNonce || !currentNonce || expectedNonce !== currentNonce) {
        out.appendLine(`git-autopush: nonce mismatch`);
        return;
    }

    out.appendLine(`git-autopush: valid token for ${doc.uri.fsPath}`);
    
    // Clear token
    context.workspaceState.update('gitAutopush.triggeredBySaveKeyFor', null);
    state.triggerNonces.delete(doc.uri.fsPath);

    // ═══════════════════════════════════════════════════════════════════════════
    // 📝 LOAD CONFIGURATION
    // ═══════════════════════════════════════════════════════════════════════════

    const config = vscode.workspace.getConfiguration('gitAutopush');
    const globs = config.get('watchGlobs', ['**/*.{py,js,ts,md,json,txt}']);
    const dryRun = config.get('dryRun', true);
    const autoCommit = config.get('autoCommit', false);
    const autoPush = config.get('autoPush', false);
    const protectedBranches = config.get('protectedBranches', ['main', 'master', 'production']);
    const sensitivePatterns = config.get('sensitiveFileGlobs', ['.env', '*.key', 'credentials.json', '*.pem']);
    const useEmoji = config.get('useEmoji', true);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const rel = workspaceFolder 
        ? path.relative(workspaceFolder, doc.uri.fsPath) 
        : doc.uri.fsPath;

    // ═══════════════════════════════════════════════════════════════════════════
    // ✅ VALIDATION CHECKS
    // ═══════════════════════════════════════════════════════════════════════════

    // Check glob match
    let matched = false;
    for (const g of globs) {
        if (minimatch(rel, g)) {
            matched = true;
            break;
        }
    }
    if (!matched) return;

    // Check autoCommit enabled
    if (!autoCommit) {
        out.appendLine('git-autopush: autoCommit disabled — skipping');
        return;
    }

    // Check git repo
    const repoRoot = gitOps.getRepoRoot(workspaceFolder);
    if (!repoRoot) {
        out.appendLine('git-autopush: not a git repository');
        vscode.window.showWarningMessage('Git AutoPush: Not a git repository');
        return;
    }

    // Check if file is git-ignored
    if (gitOps.isFileIgnored(doc.uri.fsPath, repoRoot)) {
        out.appendLine(`git-autopush: file ignored by git — skipping`);
        return;
    }

    // Check sensitive files
    for (const p of sensitivePatterns) {
        if (minimatch(rel, p)) {
            out.appendLine(`git-autopush: sensitive file — skipping`);
            vscode.window.showWarningMessage(`Git AutoPush: Skipping sensitive file`);
            return;
        }
    }

    // Get branch and check protection
    const branch = gitOps.getCurrentBranch(repoRoot);
    let canPush = autoPush;
    if (autoPush && protectedBranches.includes(branch)) {
        out.appendLine(`git-autopush: protected branch '${branch}' — no push`);
        canPush = false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🤖 GENERATE COMMIT MESSAGE (AI or Smart Default)
    // ═══════════════════════════════════════════════════════════════════════════

    // Start with smart contextual message as fallback
    let message = getSmartMessageWithFile(doc.uri.fsPath, { useEmoji });

    try {
        const aiEnabled = config.get('ai.enabled', true);
        const generate = config.get('ai.generateCommitMessage', true);
        let apiKey = config.get('ai.apiKey', '') || config.get('ai.deepseekApiKey', '') || process.env.DEEPSEEK_API_KEY || '';
        const model = config.get('ai.deepseekModel', 'deepseek/deepseek-chat');

        out.appendLine(`git-autopush: AI config - enabled=${aiEnabled}, generate=${generate}, hasKey=${!!apiKey}, model=${model}`);

        if (aiEnabled && generate) {
            // Prompt for key if missing
            if (!apiKey) {
                out.appendLine('git-autopush: No API key, prompting...');
                const entered = await vscode.window.showInputBox({
                    prompt: 'Enter your OpenRouter API key',
                    placeHolder: 'sk-or-v1-...',
                    ignoreFocusOut: true,
                    password: true,
                    validateInput: (v) => aiService.validateApiKey(v)
                });

                if (entered && entered.trim()) {
                    await config.update('ai.apiKey', entered.trim(), vscode.ConfigurationTarget.Global);
                    apiKey = entered.trim();
                    vscode.window.showInformationMessage('API key saved successfully');
                }
            }

            // Generate message
            if (apiKey) {
                out.appendLine(`git-autopush: generating AI message with ${model}...`);

                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Generating commit message...",
                    cancellable: false
                }, async () => {
                    try {
                        // Get diff
                        let diffText = gitOps.getStagedDiff(repoRoot);
                        if (!diffText) {
                            diffText = gitOps.getFileDiff(repoRoot, rel);
                        }
                        if (!diffText) {
                            diffText = doc.getText().slice(0, 2000);
                        }

                        // Generate message via AI with intelligent context
                        const commitStyle = config.get('ai.commitStyle', 'auto');
                        const conventionalCommits = config.get('ai.conventionalCommits', true);
                        const includeScope = config.get('ai.includeScope', true);

                        let generated = await aiService.generateCommitMessage({
                            apiKey,
                            model,
                            diffText,
                            fileName: rel,
                            useEmoji,
                            commitStyle,
                            conventionalCommits,
                            includeScope
                        });

                        // Force strip emoji if setting is off (AI doesn't always follow instructions)
                        if (generated && !useEmoji) {
                            generated = stripEmoji(generated);
                        }

                        message = generated || message;
                        out.appendLine(`git-autopush: using: ${message}`);

                    } catch (err) {
                        out.appendLine(`git-autopush: AI failed: ${err?.message || err}`);
                    }
                });
            }
        }
    } catch (e) {
        out.appendLine(`git-autopush: AI error: ${e?.message || e}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 🚀 EXECUTE GIT COMMANDS
    // ═══════════════════════════════════════════════════════════════════════════

    const fullCmd = gitOps.buildCommitCommand({
        workspaceFolder,
        message,
        branch,
        push: !dryRun && canPush
    });

    out.appendLine(`git-autopush: ${fullCmd}`);
    terminal.show(true);

    if (!dryRun) {
        terminal.sendText(fullCmd, true);
        
        // Update stats and store commit info for undo
        const stats = statsManager.updateStats(message);
        state.lastCommitInfo = {
            hash: gitOps.getHeadCommit(repoRoot),
            message,
            workspace: workspaceFolder,
            timestamp: Date.now()
        };

        const action = canPush ? 'Committed & pushed' : 'Committed';
        vscode.window.showInformationMessage(
            `$(git-commit) ${action} · ${stats.todayCommits} today · ${stats.streak}d streak`,
            'View Log'
        ).then(sel => { if (sel === 'View Log') out.show(); });
    } else {
        out.appendLine('git-autopush: dry run — not executing');
        out.show(true);
    }

    uiManager.updateStatusBar();
    context.workspaceState.update('gitAutopush.lastAction', new Date().toISOString());
}

exports.activate = activate;

function deactivate() { }
exports.deactivate = deactivate;

//# sourceMappingURL=extension.js.map
