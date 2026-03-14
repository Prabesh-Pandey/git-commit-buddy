"use strict";
/**
 * 📊 STATS & GAMIFICATION MODULE
 * Handles commit statistics, streaks, and achievements
 */

const vscode = require("vscode");

// Default stats structure
const DEFAULT_STATS = {
    totalCommits: 0,
    todayCommits: 0,
    lastCommitDate: null,
    streak: 0,
    longestStreak: 0,
    commitHistory: [],
    achievements: []
};

// Achievement definitions - Rewarding icons
const ACHIEVEMENTS = [
    { id: 'first_commit', name: '🥉 First Commit', condition: (s) => s.totalCommits >= 1 },
    { id: 'ten_commits', name: '🥈 10 Commits', condition: (s) => s.totalCommits >= 10 },
    { id: 'fifty_commits', name: '🥇 50 Commits', condition: (s) => s.totalCommits >= 50 },
    { id: 'hundred_commits', name: '🏆 Century Club', condition: (s) => s.totalCommits >= 100 },
    { id: 'streak_3', name: '🔥 3-Day Streak', condition: (s) => s.streak >= 3 },
    { id: 'streak_7', name: '⭐ Week Warrior', condition: (s) => s.streak >= 7 },
    { id: 'streak_30', name: '👑 Monthly Master', condition: (s) => s.streak >= 30 },
    { id: 'productive_day', name: '⚡ Productive Day', condition: (s) => s.todayCommits >= 10 },
];

/**
 * Creates a stats manager instance
 * @param {vscode.ExtensionContext} context - VS Code extension context
 */
function createStatsManager(context) {
    const STORAGE_KEY = 'gitAutopush.stats';

    /**
     * Get current stats from global state
     */
    function getStats() {
        return context.globalState.get(STORAGE_KEY, { ...DEFAULT_STATS });
    }

    /**
     * Save stats to global state
     * @param {object} stats - Stats object to save
     */
    async function saveStats(stats) {
        await context.globalState.update(STORAGE_KEY, stats);
    }

    /**
     * Check and award new achievements
     * @param {object} stats - Current stats
     */
    function checkAchievements(stats) {
        for (const ach of ACHIEVEMENTS) {
            if (!stats.achievements.includes(ach.id) && ach.condition(stats)) {
                stats.achievements.push(ach.id);
                vscode.window.showInformationMessage(`Achievement Unlocked: ${ach.name}`);
            }
        }
    }

    /**
     * Update stats after a commit
     * @param {string} commitMessage - The commit message
     * @returns {Promise<object>} Updated stats
     */
    async function updateStats(commitMessage) {
        const stats = getStats();
        const today = new Date().toDateString();
        const lastDate = stats.lastCommitDate 
            ? new Date(stats.lastCommitDate).toDateString() 
            : null;

        stats.totalCommits++;

        if (lastDate === today) {
            // Same day — just bump today counter
            stats.todayCommits++;
        } else {
            // New day (or first-ever commit when lastDate is null)
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            if (lastDate === yesterday.toDateString()) {
                // Consecutive day — extend streak
                stats.streak++;
            } else {
                // Gap of 2+ days or first-ever commit — start fresh streak
                stats.streak = 1;
            }
            stats.todayCommits = 1;
        }

        if (stats.streak > stats.longestStreak) {
            stats.longestStreak = stats.streak;
        }

        stats.lastCommitDate = new Date().toISOString();

        // Add to history (keep last 50)
        stats.commitHistory.unshift({
            message: commitMessage.slice(0, 100),
            timestamp: new Date().toISOString()
        });
        if (stats.commitHistory.length > 50) {
            stats.commitHistory.pop();
        }

        checkAchievements(stats);
        await saveStats(stats);
        return stats;
    }

    /**
     * Get all achievements with earned status
     */
    function getAllAchievements() {
        const stats = getStats();
        return ACHIEVEMENTS.map(a => ({
            ...a,
            earned: stats.achievements.includes(a.id)
        }));
    }

    return {
        getStats,
        saveStats,
        updateStats,
        getAllAchievements,
        ACHIEVEMENTS
    };
}

module.exports = { createStatsManager, DEFAULT_STATS, ACHIEVEMENTS };
