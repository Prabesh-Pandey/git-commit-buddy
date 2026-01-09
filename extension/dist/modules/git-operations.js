"use strict";
/**
 * 🔧 GIT OPERATIONS MODULE
 * Handles all git-related operations
 */

const { execSync, spawnSync } = require('child_process');

/**
 * Creates a git operations manager
 * @param {object} outputChannel - VS Code output channel for logging
 */
function createGitOperations(outputChannel) {
    const out = outputChannel;

    /**
     * Get the git repository root for a given path
     * @param {string} workspacePath - Path to check
     * @returns {string|null} Repository root or null if not a git repo
     */
    function getRepoRoot(workspacePath) {
        try {
            return execSync('git rev-parse --show-toplevel', {
                cwd: workspacePath,
                stdio: ['ignore', 'pipe', 'ignore']
            }).toString().trim();
        } catch (e) {
            return null;
        }
    }

    /**
     * Get current branch name
     * @param {string} repoRoot - Repository root path
     * @returns {string} Branch name or commit hash if detached
     */
    function getCurrentBranch(repoRoot) {
        try {
            return execSync('git symbolic-ref --short HEAD', {
                cwd: repoRoot,
                stdio: ['ignore', 'pipe', 'ignore']
            }).toString().trim();
        } catch (e) {
            // Detached HEAD - return short hash
            return execSync('git rev-parse --short HEAD', {
                cwd: repoRoot,
                stdio: ['ignore', 'pipe', 'ignore']
            }).toString().trim();
        }
    }

    /**
     * Check if a file is ignored by git
     * @param {string} filePath - Full file path
     * @param {string} repoRoot - Repository root
     * @returns {boolean} True if ignored
     */
    function isFileIgnored(filePath, repoRoot) {
        try {
            const result = spawnSync('git', ['check-ignore', filePath], { cwd: repoRoot });
            return result.status === 0;
        } catch (e) {
            return false;
        }
    }

    /**
     * Get the current HEAD commit hash
     * @param {string} repoRoot - Repository root
     * @returns {string|null} Commit hash or null
     */
    function getHeadCommit(repoRoot) {
        try {
            return execSync('git rev-parse HEAD', {
                cwd: repoRoot,
                stdio: ['ignore', 'pipe', 'ignore']
            }).toString().trim();
        } catch (e) {
            return null;
        }
    }

    /**
     * Get staged diff
     * @param {string} repoRoot - Repository root
     * @param {number} maxLength - Maximum diff length (default 8000)
     * @returns {string} Diff text
     */
    function getStagedDiff(repoRoot, maxLength = 8000) {
        try {
            // Stage all changes first
            execSync('git add -A', {
                cwd: repoRoot,
                stdio: ['ignore', 'pipe', 'ignore']
            });

            let diff = execSync('git diff --cached --no-color --unified=3', {
                cwd: repoRoot,
                stdio: ['ignore', 'pipe', 'ignore']
            }).toString();

            if (diff.length > maxLength) {
                diff = diff.slice(0, maxLength) + '\n...(truncated)';
            }

            return diff;
        } catch (e) {
            out.appendLine(`git-autopush: getStagedDiff error: ${e.message}`);
            return '';
        }
    }

    /**
     * Get diff for a specific file
     * @param {string} repoRoot - Repository root
     * @param {string} relativePath - Relative file path
     * @returns {string} Diff text
     */
    function getFileDiff(repoRoot, relativePath) {
        try {
            return execSync(`git diff --no-color -- "${relativePath}"`, {
                cwd: repoRoot,
                stdio: ['ignore', 'pipe', 'ignore']
            }).toString();
        } catch (e) {
            return '';
        }
    }

    /**
     * Build git command string for commit and optional push
     * @param {object} options - Command options
     * @param {string} options.workspaceFolder - Workspace folder path
     * @param {string} options.message - Commit message
     * @param {string} options.branch - Branch name
     * @param {boolean} options.push - Whether to push
     * @returns {string} Full command string
     */
    function buildCommitCommand({ workspaceFolder, message, branch, push }) {
        // Escape message for shell
        const escapedMessage = message
            .replace(/"/g, '\\"')
            .replace(/\$/g, '\\$');

        const commands = [
            'git add -A',
            `git commit -m "${escapedMessage}" || echo "nothing to commit"`
        ];

        if (push) {
            commands.push(`git push origin ${branch}`);
        }

        const cwdPrefix = workspaceFolder 
            ? `cd "${workspaceFolder.replace(/"/g, '\\"')}" && `
            : '';

        return cwdPrefix + commands.join(' && ');
    }

    /**
     * Build git reset command
     * @param {string} workspaceFolder - Workspace folder
     * @param {string} resetType - 'soft' or 'hard'
     * @returns {string} Reset command
     */
    function buildResetCommand(workspaceFolder, resetType) {
        const flag = resetType === 'hard' ? '--hard' : '--soft';
        return `cd "${workspaceFolder}" && git reset ${flag} HEAD~1`;
    }

    return {
        getRepoRoot,
        getCurrentBranch,
        isFileIgnored,
        getHeadCommit,
        getStagedDiff,
        getFileDiff,
        buildCommitCommand,
        buildResetCommand
    };
}

module.exports = { createGitOperations };
