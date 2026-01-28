"use strict";
/**
 * PR GENERATOR MODULE
 * Generates AI-powered Pull Request descriptions from commit history
 */

const { execSync } = require('child_process');
const { analyzeDiff, ChangeType } = require('./change-analyzer');

/**
 * Creates a PR generator instance
 * @param {object} outputChannel - VS Code output channel for logging
 */
function createPRGenerator(outputChannel) {
    const out = outputChannel;

    /**
     * Get commits between current branch and base branch
     * @param {string} repoRoot - Repository root path
     * @param {string} baseBranch - Base branch to compare against
     * @returns {Array} Array of commit objects
     */
    function getCommitsSinceBranch(repoRoot, baseBranch = 'main') {
        try {
            // Try the specified base branch first, fall back to alternatives
            const branches = [baseBranch, 'main', 'master', 'develop'];
            let actualBase = null;
            
            for (const branch of branches) {
                try {
                    execSync(`git rev-parse --verify ${branch}`, {
                        cwd: repoRoot,
                        stdio: ['ignore', 'pipe', 'ignore']
                    });
                    actualBase = branch;
                    break;
                } catch (e) {
                    continue;
                }
            }

            if (!actualBase) {
                out.appendLine('git-autopush: No valid base branch found');
                return [];
            }

            out.appendLine(`git-autopush: Using base branch: ${actualBase}`);

            // Get commit log with format: hash|subject|author|date
            const logOutput = execSync(
                `git log ${actualBase}..HEAD --pretty=format:"%H|%s|%an|%ad" --date=short --no-merges`,
                {
                    cwd: repoRoot,
                    stdio: ['ignore', 'pipe', 'ignore']
                }
            ).toString().trim();

            if (!logOutput) {
                out.appendLine('git-autopush: No commits found since base branch');
                return [];
            }

            const commits = logOutput.split('\n').map(line => {
                const [hash, subject, author, date] = line.split('|');
                return { hash, subject, author, date };
            });

            out.appendLine(`git-autopush: Found ${commits.length} commits`);
            return commits;

        } catch (e) {
            out.appendLine(`git-autopush: Error getting commits: ${e.message}`);
            return [];
        }
    }

    /**
     * Get files changed between branches
     * @param {string} repoRoot - Repository root path
     * @param {string} baseBranch - Base branch to compare against
     * @returns {object} File change statistics
     */
    function getFileChanges(repoRoot, baseBranch = 'main') {
        try {
            const branches = [baseBranch, 'main', 'master', 'develop'];
            let actualBase = null;
            
            for (const branch of branches) {
                try {
                    execSync(`git rev-parse --verify ${branch}`, {
                        cwd: repoRoot,
                        stdio: ['ignore', 'pipe', 'ignore']
                    });
                    actualBase = branch;
                    break;
                } catch (e) {
                    continue;
                }
            }

            if (!actualBase) return { files: [], stats: { added: 0, removed: 0 } };

            // Get file stats
            const statOutput = execSync(
                `git diff ${actualBase}...HEAD --stat --stat-width=200`,
                {
                    cwd: repoRoot,
                    stdio: ['ignore', 'pipe', 'ignore']
                }
            ).toString().trim();

            // Get list of changed files with status
            const filesOutput = execSync(
                `git diff ${actualBase}...HEAD --name-status`,
                {
                    cwd: repoRoot,
                    stdio: ['ignore', 'pipe', 'ignore']
                }
            ).toString().trim();

            const files = filesOutput.split('\n').filter(l => l).map(line => {
                const [status, ...pathParts] = line.split('\t');
                const path = pathParts.join('\t');
                const statusMap = {
                    'A': 'added',
                    'M': 'modified',
                    'D': 'deleted',
                    'R': 'renamed'
                };
                return {
                    path,
                    status: statusMap[status.charAt(0)] || 'modified'
                };
            });

            // Parse total stats from last line
            const statsMatch = statOutput.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/);
            const stats = {
                filesChanged: statsMatch ? parseInt(statsMatch[1]) || 0 : files.length,
                added: statsMatch ? parseInt(statsMatch[2]) || 0 : 0,
                removed: statsMatch ? parseInt(statsMatch[3]) || 0 : 0
            };

            return { files, stats };

        } catch (e) {
            out.appendLine(`git-autopush: Error getting file changes: ${e.message}`);
            return { files: [], stats: { filesChanged: 0, added: 0, removed: 0 } };
        }
    }

    /**
     * Get the full diff between branches
     * @param {string} repoRoot - Repository root path
     * @param {string} baseBranch - Base branch
     * @param {number} maxLength - Maximum diff length
     * @returns {string} Diff text
     */
    function getBranchDiff(repoRoot, baseBranch = 'main', maxLength = 10000) {
        try {
            const branches = [baseBranch, 'main', 'master', 'develop'];
            let actualBase = null;
            
            for (const branch of branches) {
                try {
                    execSync(`git rev-parse --verify ${branch}`, {
                        cwd: repoRoot,
                        stdio: ['ignore', 'pipe', 'ignore']
                    });
                    actualBase = branch;
                    break;
                } catch (e) {
                    continue;
                }
            }

            if (!actualBase) return '';

            let diff = execSync(
                `git diff ${actualBase}...HEAD --no-color`,
                {
                    cwd: repoRoot,
                    stdio: ['ignore', 'pipe', 'ignore'],
                    maxBuffer: 1024 * 1024 * 10
                }
            ).toString();

            if (diff.length > maxLength) {
                diff = diff.slice(0, maxLength) + '\n...(truncated)';
            }

            return diff;

        } catch (e) {
            out.appendLine(`git-autopush: Error getting branch diff: ${e.message}`);
            return '';
        }
    }

    /**
     * Get current branch name
     * @param {string} repoRoot - Repository root path
     * @returns {string} Current branch name
     */
    function getCurrentBranch(repoRoot) {
        try {
            return execSync('git symbolic-ref --short HEAD', {
                cwd: repoRoot,
                stdio: ['ignore', 'pipe', 'ignore']
            }).toString().trim();
        } catch (e) {
            return 'unknown';
        }
    }

    /**
     * Aggregate commits by type
     * @param {Array} commits - Array of commit objects
     * @returns {object} Grouped commits
     */
    function aggregateCommits(commits) {
        const groups = {
            feat: [],
            fix: [],
            refactor: [],
            docs: [],
            test: [],
            chore: [],
            other: []
        };

        const typePatterns = {
            feat: /^(feat|feature|add|implement)/i,
            fix: /^(fix|bug|hotfix|patch)/i,
            refactor: /^(refactor|clean|improve|optimize)/i,
            docs: /^(doc|readme|comment)/i,
            test: /^(test|spec)/i,
            chore: /^(chore|build|ci|deps)/i
        };

        for (const commit of commits) {
            let matched = false;
            const subject = commit.subject || '';

            for (const [type, pattern] of Object.entries(typePatterns)) {
                if (pattern.test(subject)) {
                    groups[type].push(commit);
                    matched = true;
                    break;
                }
            }

            if (!matched) {
                groups.other.push(commit);
            }
        }

        // Calculate percentages
        const total = commits.length;
        const percentages = {};
        for (const [type, list] of Object.entries(groups)) {
            if (list.length > 0) {
                percentages[type] = Math.round((list.length / total) * 100);
            }
        }

        return { groups, percentages };
    }

    /**
     * Detect issue/ticket references in commits
     * @param {Array} commits - Array of commit objects
     * @returns {Array} Array of issue references
     */
    function detectIssueReferences(commits) {
        const issues = new Set();
        const patterns = [
            /#(\d+)/g,                           // GitHub issues: #123
            /([A-Z]+-\d+)/g,                     // Jira: PROJ-123
            /(?:fix|close|resolve)s?\s+#(\d+)/gi // Closing keywords
        ];

        for (const commit of commits) {
            const subject = commit.subject || '';
            for (const pattern of patterns) {
                const matches = subject.matchAll(pattern);
                for (const match of matches) {
                    issues.add(match[1] || match[0]);
                }
            }
        }

        return Array.from(issues);
    }

    /**
     * Build context for AI prompt
     * @param {object} params - Parameters
     * @returns {string} Context string for AI
     */
    function buildPRContext({ commits, fileChanges, aggregated, issues, currentBranch, baseBranch }) {
        let context = '';

        context += `BRANCH: ${currentBranch} -> ${baseBranch}\n\n`;

        context += `COMMITS (${commits.length} total, oldest to newest):\n`;
        for (const commit of commits.slice().reverse()) {
            context += `- ${commit.subject}\n`;
        }
        context += '\n';

        context += `FILES CHANGED: ${fileChanges.stats.filesChanged} files `;
        context += `(+${fileChanges.stats.added}, -${fileChanges.stats.removed})\n\n`;

        if (Object.keys(aggregated.percentages).length > 0) {
            context += 'CHANGE TYPES: ';
            const types = Object.entries(aggregated.percentages)
                .sort((a, b) => b[1] - a[1])
                .map(([type, pct]) => `${pct}% ${type}`)
                .join(', ');
            context += types + '\n\n';
        }

        if (issues.length > 0) {
            context += `LINKED ISSUES: ${issues.join(', ')}\n\n`;
        }

        // Add file list if not too long
        if (fileChanges.files.length <= 20) {
            context += 'CHANGED FILES:\n';
            for (const file of fileChanges.files) {
                context += `- [${file.status}] ${file.path}\n`;
            }
        }

        return context;
    }

    /**
     * Generate PR description using AI
     * @param {object} aiService - AI service instance
     * @param {object} params - Generation parameters
     * @returns {Promise<object>} Generated PR title and description
     */
    async function generatePRDescription(aiService, params) {
        const {
            repoRoot,
            baseBranch = 'main',
            apiKey,
            model,
            useEmoji = false
        } = params;

        // Gather all data
        const commits = getCommitsSinceBranch(repoRoot, baseBranch);
        if (commits.length === 0) {
            return {
                title: '',
                description: 'No commits found between branches.',
                error: 'No commits found'
            };
        }

        const fileChanges = getFileChanges(repoRoot, baseBranch);
        const aggregated = aggregateCommits(commits);
        const issues = detectIssueReferences(commits);
        const currentBranch = getCurrentBranch(repoRoot);
        const diff = getBranchDiff(repoRoot, baseBranch, 6000);

        const context = buildPRContext({
            commits,
            fileChanges,
            aggregated,
            issues,
            currentBranch,
            baseBranch
        });

        out.appendLine('git-autopush: Generating PR description...');
        out.appendLine(`git-autopush: Context length: ${context.length} chars`);

        // Build AI prompt
        const systemPrompt = buildPRSystemPrompt(useEmoji);
        const userPrompt = `Generate a Pull Request description for the following changes:\n\n${context}\n\nDIFF PREVIEW:\n${diff.slice(0, 3000)}`;

        // Call AI (reusing existing infrastructure)
        const https = require('https');
        
        const payload = JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.4,
            max_tokens: 800
        });

        try {
            const response = await makeAIRequest(apiKey, payload);
            const parsed = parsePRResponse(response);
            return parsed;
        } catch (e) {
            out.appendLine(`git-autopush: PR generation failed: ${e.message}`);
            return {
                title: currentBranch.replace(/[-_]/g, ' '),
                description: generateFallbackDescription(commits, fileChanges, aggregated),
                error: e.message
            };
        }
    }

    /**
     * Build system prompt for PR generation
     */
    function buildPRSystemPrompt(useEmoji) {
        const emojiNote = useEmoji 
            ? 'You may use relevant emojis sparingly.'
            : 'Do NOT use any emojis.';

        return `You are an expert at writing clear, professional Pull Request descriptions.

Generate a PR with the following structure:

TITLE: A concise title (max 60 chars) summarizing the main change

## Summary
A brief paragraph (2-3 sentences) explaining what this PR accomplishes and why.

## Changes
- Bullet points of key changes, grouped logically
- Focus on WHAT changed and WHY, not implementation details
- Use conventional commit prefixes (feat, fix, refactor, etc.)

## Files Changed
- List the most important files with brief descriptions of changes
- Group related files together
- Skip generated or lock files

## Testing
- Brief notes on how to test the changes
- Any specific areas that need careful review

## Breaking Changes
Only include this section if there are breaking changes.

${emojiNote}

CRITICAL RULES:
- Be concise but informative
- Focus on reviewer needs
- Highlight any risky or complex changes
- Return ONLY the PR content, nothing else
- Start your response with "TITLE: " followed by the title`;
    }

    /**
     * Make AI API request
     */
    function makeAIRequest(apiKey, payload) {
        return new Promise((resolve, reject) => {
            const https = require('https');
            const req = https.request({
                hostname: 'openrouter.ai',
                port: 443,
                path: '/api/v1/chat/completions',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'https://github.com/local/git-autopush-on-save',
                    'X-Title': 'Git AutoPush Extension'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error(`HTTP ${res.statusCode}`));
                        return;
                    }
                    resolve(data);
                });
            });

            req.on('error', reject);
            req.setTimeout(30000, () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            req.write(payload);
            req.end();
        });
    }

    /**
     * Parse AI response into title and description
     */
    function parsePRResponse(rawData) {
        const json = JSON.parse(rawData || '{}');

        if (json.error) {
            throw new Error(json.error.message || 'API error');
        }

        let content = '';
        if (json.choices && json.choices[0]?.message?.content) {
            content = json.choices[0].message.content.trim();
        }

        if (!content) {
            throw new Error('Empty response from API');
        }

        // Extract title
        let title = '';
        let description = content;

        const titleMatch = content.match(/^TITLE:\s*(.+?)(?:\n|$)/i);
        if (titleMatch) {
            title = titleMatch[1].trim();
            description = content.slice(titleMatch[0].length).trim();
        } else {
            // Try to extract from first line
            const firstLine = content.split('\n')[0];
            if (firstLine.length < 80 && !firstLine.startsWith('#')) {
                title = firstLine;
                description = content.split('\n').slice(1).join('\n').trim();
            }
        }

        // Clean up description
        description = description
            .replace(/^#+\s*TITLE.*$/gm, '')
            .replace(/^\s*\n/gm, '\n')
            .trim();

        return { title, description };
    }

    /**
     * Generate fallback description without AI
     */
    function generateFallbackDescription(commits, fileChanges, aggregated) {
        let desc = '## Summary\n';
        desc += `This PR includes ${commits.length} commit(s) with changes to ${fileChanges.stats.filesChanged} file(s).\n\n`;

        desc += '## Changes\n';
        for (const [type, list] of Object.entries(aggregated.groups)) {
            if (list.length > 0) {
                for (const commit of list) {
                    desc += `- ${commit.subject}\n`;
                }
            }
        }
        desc += '\n';

        desc += '## Files Changed\n';
        for (const file of fileChanges.files.slice(0, 15)) {
            desc += `- \`${file.path}\` (${file.status})\n`;
        }
        if (fileChanges.files.length > 15) {
            desc += `- ... and ${fileChanges.files.length - 15} more files\n`;
        }

        return desc;
    }

    return {
        getCommitsSinceBranch,
        getFileChanges,
        getBranchDiff,
        getCurrentBranch,
        aggregateCommits,
        detectIssueReferences,
        generatePRDescription
    };
}

module.exports = { createPRGenerator };
