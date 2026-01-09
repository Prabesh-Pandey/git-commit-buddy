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
                text += ` 🔥${stats.streak}d`;
            }

            statusBar.text = text;

            // Build tooltip
            const tooltipLines = [
                `**Git AutoPush** $(git-commit)`,
                `---`,
                `Auto Commit: ${autoCommit ? '✅ On' : '○ Off'}`,
                `Auto Push: ${autoPush ? '✅ On' : '○ Off'}`,
                `Dry Run: ${dryRun ? '⚠️ Yes' : '✓ No'}`,
                `---`,
                `**📊 Statistics**`,
                `Total: ${stats.totalCommits} │ Today: ${stats.todayCommits}`,
                `🔥 Streak: ${stats.streak}d │ ⭐ Best: ${stats.longestStreak}d`,
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
        const locked = achievements.filter(a => !a.earned).map(a => a.name.replace(/^./, '🔒'));

        const panel = vscode.window.createWebviewPanel(
            'gitAutopushStats',
            '📊 Git AutoPush Stats',
            vscode.ViewColumn.One,
            {}
        );

        panel.webview.html = `<!DOCTYPE html>
<html><head><style>
body { 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding: 30px; 
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    color: #eee;
    min-height: 100vh;
}
h1 { 
    font-size: 28px; 
    margin-bottom: 30px;
    display: flex;
    align-items: center;
    gap: 10px;
}
.stat { 
    font-size: 52px; 
    font-weight: 700;
    text-align: center; 
    margin: 15px 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}
.label { 
    font-size: 13px; 
    color: #888; 
    text-align: center;
    text-transform: uppercase;
    letter-spacing: 1px;
}
.grid { 
    display: grid; 
    grid-template-columns: repeat(3, 1fr); 
    gap: 20px; 
    margin: 30px 0; 
}
.card { 
    background: rgba(255,255,255,0.05);
    backdrop-filter: blur(10px);
    padding: 25px; 
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.1);
    transition: transform 0.2s, box-shadow 0.2s;
}
.card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0,0,0,0.3);
}
.today-card {
    background: linear-gradient(135deg, rgba(102,126,234,0.2) 0%, rgba(118,75,162,0.2) 100%);
    border: 1px solid rgba(102,126,234,0.3);
}
.badge { 
    display: inline-block; 
    padding: 8px 16px; 
    margin: 6px; 
    border-radius: 20px;
    background: rgba(255,255,255,0.1);
    font-size: 14px;
    border: 1px solid rgba(255,255,255,0.1);
}
.badge.earned {
    background: linear-gradient(135deg, rgba(102,126,234,0.3) 0%, rgba(118,75,162,0.3) 100%);
    border: 1px solid rgba(102,126,234,0.5);
}
.locked { 
    opacity: 0.4;
    filter: grayscale(100%);
}
.achievements { margin-top: 40px; }
h2 { 
    font-size: 20px;
    margin-bottom: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.progress-text {
    font-size: 14px;
    color: #888;
    margin-left: auto;
}
</style></head>
<body>
<h1>📊 Git AutoPush Stats</h1>
<div class="grid">
    <div class="card">
        <div class="stat">${stats.totalCommits}</div>
        <div class="label">Total Commits</div>
    </div>
    <div class="card">
        <div class="stat">🔥 ${stats.streak}</div>
        <div class="label">Day Streak</div>
    </div>
    <div class="card">
        <div class="stat">⭐ ${stats.longestStreak}</div>
        <div class="label">Best Streak</div>
    </div>
</div>
<div class="card today-card">
    <div class="stat">${stats.todayCommits}</div>
    <div class="label">Commits Today</div>
</div>
<div class="achievements">
    <h2>🏆 Achievements <span class="progress-text">${earned.length} of ${achievements.length} unlocked</span></h2>
    <div>
        ${earned.map(a => `<span class="badge earned">${a}</span>`).join('')}
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
