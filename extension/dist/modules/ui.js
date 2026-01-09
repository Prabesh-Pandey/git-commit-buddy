"use strict";
/**
 * 🎨 UI MODULE
 * Handles status bar, webviews, and UI-related functionality
 */

const vscode = require("vscode");

/**
 * Creates UI manager for status bar and visual elements
 * @param {object} options - Configuration options
 * @param {function} options.getStats - Function to get current stats
 * @param {object} options.outputChannel - Output channel for logging
 */
function createUIManager({ getStats, outputChannel }) {
    const out = outputChannel;
    
    // Create status bar item
    const statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right, 
        100
    );
    statusBar.command = 'git-autopush.showQuickActions';

    /**
     * Update status bar display
     */
    function updateStatusBar() {
        try {
            const cfg = vscode.workspace.getConfiguration('gitAutopush');
            const autoCommit = cfg.get('autoCommit', false);
            const autoPush = cfg.get('autoPush', false);
            const dryRun = cfg.get('dryRun', true);
            const showStats = cfg.get('showStatsInStatusBar', true);
            const stats = getStats();

            // Build icon and text
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

            // Build tooltip
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
            
            // Warning background if active and not dry run
            statusBar.backgroundColor = autoCommit && !dryRun
                ? new vscode.ThemeColor('statusBarItem.warningBackground')
                : undefined;

            statusBar.show();
        } catch (e) {
            out.appendLine(`git-autopush: statusBar error: ${e?.message || e}`);
        }
    }

    /**
     * Create stats webview panel
     * @param {object} stats - Current stats
     * @param {Array} achievements - All achievements with earned status
     */
    function showStatsPanel(stats, achievements) {
        const earned = achievements.filter(a => a.earned).map(a => a.name);
        const locked = achievements.filter(a => !a.earned).map(a => `🔒 ${a.name}`);

        const panel = vscode.window.createWebviewPanel(
            'gitAutopushStats',
            '📊 Git AutoPush Stats',
            vscode.ViewColumn.One,
            {}
        );

        panel.webview.html = `<!DOCTYPE html>
<html><head><style>
body { 
    font-family: var(--vscode-font-family); 
    padding: 20px; 
    background: var(--vscode-editor-background); 
    color: var(--vscode-editor-foreground); 
}
.stat { font-size: 48px; text-align: center; margin: 20px 0; }
.label { font-size: 14px; color: var(--vscode-descriptionForeground); text-align: center; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 30px 0; }
.card { 
    background: var(--vscode-input-background); 
    padding: 20px; 
    border-radius: 8px; 
    text-align: center; 
}
.badge { 
    display: inline-block; 
    padding: 5px 10px; 
    margin: 5px; 
    border-radius: 15px; 
    background: var(--vscode-badge-background); 
}
.locked { opacity: 0.5; }
h2 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; }
</style></head>
<body>
<h1>📊 Your Git AutoPush Stats</h1>
<div class="grid">
    <div class="card">
        <div class="stat">${stats.totalCommits}</div>
        <div class="label">Total Commits</div>
    </div>
    <div class="card">
        <div class="stat">🔥 ${stats.streak}</div>
        <div class="label">Current Streak</div>
    </div>
    <div class="card">
        <div class="stat">⭐ ${stats.longestStreak}</div>
        <div class="label">Longest Streak</div>
    </div>
</div>
<div class="card">
    <div class="stat">${stats.todayCommits}</div>
    <div class="label">Commits Today</div>
</div>
<div class="achievements">
    <h2>🏆 Achievements (${earned.length}/${achievements.length})</h2>
    <div>
        ${earned.map(a => `<span class="badge">${a}</span>`).join('')}
        ${locked.map(a => `<span class="badge locked">${a}</span>`).join('')}
    </div>
</div>
</body></html>`;

        return panel;
    }

    /**
     * Get the status bar item (for disposal)
     */
    function getStatusBarItem() {
        return statusBar;
    }

    return {
        updateStatusBar,
        showStatsPanel,
        getStatusBarItem
    };
}

module.exports = { createUIManager };
