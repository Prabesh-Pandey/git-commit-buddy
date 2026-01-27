"use strict";
/**
 * 🤖 AI SERVICE MODULE
 * Handles AI-powered commit message generation via OpenRouter API
 * Enhanced with intelligent context-aware prompts
 */

const https = require('https');
const { analyzeDiff, generateContextHints, Complexity } = require('./change-analyzer');

// API Configuration
const API_CONFIG = {
    hostname: 'openrouter.ai',
    port: 443,
    path: '/api/v1/chat/completions',
    timeout: 15000
};

/**
 * Creates an AI service instance
 * @param {object} outputChannel - VS Code output channel for logging
 */
function createAIService(outputChannel) {
    const out = outputChannel;

    /**
     * Generate a commit message using AI with intelligent context awareness
     * @param {object} options - Generation options
     * @param {string} options.apiKey - OpenRouter API key
     * @param {string} options.model - Model to use (e.g., 'deepseek/deepseek-chat')
     * @param {string} options.diffText - Git diff or file content
     * @param {string} options.fileName - Name of the file being committed
     * @param {boolean} options.useEmoji - Whether to include emoji
     * @param {string} options.commitStyle - 'concise', 'detailed', or 'auto'
     * @param {boolean} options.conventionalCommits - Use conventional commit format
     * @param {boolean} options.includeScope - Include scope in commit messages
     * @returns {Promise<string>} Generated commit message
     */
    async function generateCommitMessage({ 
        apiKey, 
        model, 
        diffText, 
        fileName, 
        useEmoji = true,
        commitStyle = 'auto',
        conventionalCommits = true,
        includeScope = true
    }) {
        // Analyze the diff for context
        const analysis = analyzeDiff(diffText, fileName);
        const contextHints = generateContextHints(analysis);
        
        out.appendLine(`git-autopush: Analysis - ${analysis.complexity} complexity, ${analysis.changeType} type, scope: ${analysis.scope || 'none'}`);

        // Determine effective style based on analysis if 'auto'
        const effectiveStyle = commitStyle === 'auto' 
            ? analysis.suggestedLength 
            : commitStyle;

        // Build the system prompt dynamically
        const systemPrompt = buildSystemPrompt({
            useEmoji,
            effectiveStyle,
            conventionalCommits,
            includeScope,
            analysis,
            contextHints
        });

        // Build user prompt with analysis context
        const userPrompt = buildUserPrompt(diffText, fileName, analysis, contextHints);

        const payload = JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.4,  // Slightly lower for more consistent output
            max_tokens: effectiveStyle === 'detailed' ? 400 : 200
        });

        out.appendLine(`git-autopush: AI request to ${model} (style: ${effectiveStyle})...`);

        const rawResponse = await makeAPIRequest(apiKey, payload);
        const message = parseResponse(rawResponse, effectiveStyle);
        
        out.appendLine(`git-autopush: AI generated: "${message.split('\n')[0]}..."`);
        return message;
    }

    /**
     * Build intelligent system prompt based on context
     */
    function buildSystemPrompt({ useEmoji, effectiveStyle, conventionalCommits, includeScope, analysis }) {
        const emojiInstruction = useEmoji 
            ? 'Start with a relevant emoji that matches the change type.'
            : 'Do NOT include any emojis. Start directly with the type prefix.';

        const emojiGuide = useEmoji 
            ? `\nEMOJI GUIDE:\n✨ feat  🐛 fix  ♻️ refactor  📝 docs  🎨 style  ⚡ perf  🧪 test  📦 build  👷 ci  🔧 chore  🔒 security`
            : '';

        // Build format instructions based on style
        let formatInstructions = '';
        
        if (effectiveStyle === 'short') {
            formatInstructions = `
FORMAT (SHORT - for small changes):
- Single line only, max 50 characters
- ${conventionalCommits ? 'Use conventional commit prefix (feat:, fix:, etc.)' : 'Start with action verb'}
${includeScope && analysis.scope ? `- Include scope: ${analysis.changeType}(${analysis.scope}): message` : ''}
- Be extremely concise
- Example: "${useEmoji ? '🐛 ' : ''}fix: correct typo in button label"`;
        } else if (effectiveStyle === 'medium') {
            formatInstructions = `
FORMAT (MEDIUM - for moderate changes):
- Line 1: Subject line (max 50 chars) ${conventionalCommits ? 'with conventional prefix' : ''}
${includeScope && analysis.scope ? `- Include scope: ${analysis.changeType}(${analysis.scope}): message` : ''}
- Line 2: Empty line
- Lines 3-4: Brief explanation (1-2 bullet points if helpful)
- Example:
"${useEmoji ? '✨ ' : ''}feat(auth): add password reset flow

- Add email verification step
- Create reset token logic"`;
        } else {
            formatInstructions = `
FORMAT (DETAILED - for significant changes):
- Line 1: Subject line (max 50 chars) ${conventionalCommits ? 'with conventional prefix' : ''}
${includeScope && analysis.scope ? `- Include scope: ${analysis.changeType}(${analysis.scope}): message` : ''}
- Line 2: Empty line
- Lines 3+: Detailed body with:
  - What changed and why
  - Key implementation details (2-4 bullet points)
  ${analysis.isBreakingChange ? '- BREAKING CHANGE: note at the end' : ''}
- Example:
"${useEmoji ? '♻️ ' : ''}refactor(api): restructure endpoint handlers

- Migrate from callbacks to async/await
- Split monolithic handlers into services
- Add comprehensive error handling
${analysis.isBreakingChange ? '\nBREAKING CHANGE: API endpoints now use v2 prefix' : ''}"`;
        }

        // Conventional commit types reminder
        const conventionalTypes = conventionalCommits ? `
CONVENTIONAL COMMIT TYPES:
- feat: new feature for the user
- fix: bug fix for the user
- refactor: code change that neither fixes a bug nor adds a feature
- docs: documentation only changes
- style: formatting, whitespace (no logic change)
- perf: performance improvement
- test: adding or updating tests
- build: build system or external dependencies
- ci: CI configuration changes
- chore: routine tasks, maintenance` : '';

        return `You are an expert git commit message writer. Write clear, professional commit messages.

CHANGE CONTEXT:
- Complexity: ${analysis.complexity} (${analysis.totalChanges} lines changed)
- Detected type: ${analysis.changeType}
${analysis.scope ? `- Scope: ${analysis.scope}` : ''}
${analysis.isBreakingChange ? '- ⚠️ BREAKING CHANGE DETECTED' : ''}
${analysis.hasNewFunction ? '- New functions/classes added' : ''}
${analysis.hasDependencyChanges ? '- Dependencies modified' : ''}

${formatInstructions}
${conventionalTypes}
${emojiGuide}

${emojiInstruction}

CRITICAL RULES:
- Be specific about what changed
- Use imperative mood (Add, Fix, Update - not Added, Fixed, Updated)
- No period at end of subject line
- Match message detail to change importance
- Reply with ONLY the commit message, nothing else`;
    }

    /**
     * Build user prompt with diff and context
     */
    function buildUserPrompt(diffText, fileName, analysis, contextHints) {
        let prompt = `Write a commit message for these changes:\n\n`;
        
        prompt += `File: ${fileName}\n`;
        prompt += `Stats: +${analysis.linesAdded} added, -${analysis.linesRemoved} removed\n\n`;
        
        if (diffText && diffText.length > 0) {
            // Truncate diff if too long, keeping start and end
            let displayDiff = diffText;
            if (diffText.length > 4000) {
                const start = diffText.slice(0, 2000);
                const end = diffText.slice(-1500);
                displayDiff = `${start}\n\n... (truncated ${diffText.length - 3500} chars) ...\n\n${end}`;
            }
            prompt += `Diff:\n${displayDiff}`;
        } else {
            prompt += `(No diff available - file content changed)`;
        }

        return prompt;
    }

    /**
     * Make HTTP request to OpenRouter API
     * @param {string} apiKey - API key
     * @param {string} payload - JSON payload
     * @returns {Promise<string>} Raw response data
     */
    function makeAPIRequest(apiKey, payload) {
        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: API_CONFIG.hostname,
                port: API_CONFIG.port,
                path: API_CONFIG.path,
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
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode < 200 || res.statusCode >= 300) {
                        reject(new Error(`HTTP ${res.statusCode}`));
                        return;
                    }
                    resolve(data);
                });
            });

            req.on('error', (e) => reject(e));
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            req.setTimeout(API_CONFIG.timeout);
            req.write(payload);
            req.end();
        });
    }

    /**
     * Parse API response and extract commit message
     * @param {string} rawData - Raw JSON response
     * @param {string} style - Message style ('short', 'medium', 'detailed')
     * @returns {string} Cleaned commit message
     */
    function parseResponse(rawData, style = 'medium') {
        const json = JSON.parse(rawData || '{}');
        
        out.appendLine(`git-autopush: API response received (${style} style)`);

        if (json.error) {
            throw new Error(json.error.message || 'API error');
        }

        let raw = '';
        if (json.choices && json.choices[0]?.message?.content) {
            raw = json.choices[0].message.content.trim();
        }

        if (!raw) {
            throw new Error('Empty response from API');
        }

        // Clean up the response
        let lines = raw
            .split('\n')
            .map(line => line
                .replace(/^["'`]+|["'`]+$/g, '')     // Remove quotes
                .replace(/^\*+|\*+$/g, '')           // Remove asterisks  
                .replace(/^#+\s*/, '')               // Remove markdown headers
                .trim()
            );

        // For short style, only keep first non-empty line
        if (style === 'short') {
            const subject = lines.find(l => l.length > 0) || '';
            return subject.length > 72 ? subject.slice(0, 69) + '...' : subject;
        }

        // Remove empty lines at start/end
        while (lines.length && !lines[0]) lines.shift();
        while (lines.length && !lines[lines.length - 1]) lines.pop();

        // Subject line (first line) - max 72 chars
        let subject = lines[0] || '';
        if (subject.length > 72) {
            subject = subject.slice(0, 69) + '...';
        }

        // For medium style, limit body
        if (style === 'medium') {
            const body = lines.slice(1, 5).filter(l => l).join('\n');
            return body ? `${subject}\n\n${body}` : subject;
        }

        // Detailed style - keep more content
        const body = lines.slice(1, 10).filter(l => l || lines.indexOf(l) === 1).join('\n');
        return body ? `${subject}\n\n${body}` : subject;
    }

    /**
     * Validate API key format
     * @param {string} key - API key to validate
     * @returns {string|null} Error message or null if valid
     */
    function validateApiKey(key) {
        if (!key || key.trim().length < 20) {
            return 'API key is too short';
        }
        if (!key.startsWith('sk-or-')) {
            return 'OpenRouter keys start with sk-or-';
        }
        return null;
    }

    /**
     * Test API connection
     * @param {string} apiKey - API key to test
     * @param {string} model - Model to test with
     * @returns {Promise<boolean>} True if successful
     */
    async function testConnection(apiKey, model) {
        try {
            const payload = JSON.stringify({
                model,
                messages: [{ role: 'user', content: 'Say "OK"' }],
                max_tokens: 10
            });
            await makeAPIRequest(apiKey, payload);
            return true;
        } catch (e) {
            out.appendLine(`git-autopush: API test failed: ${e.message}`);
            return false;
        }
    }

    return {
        generateCommitMessage,
        validateApiKey,
        testConnection
    };
}

module.exports = { createAIService, API_CONFIG };

