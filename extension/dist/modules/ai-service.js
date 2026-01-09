"use strict";
/**
 * 🤖 AI SERVICE MODULE
 * Handles AI-powered commit message generation via OpenRouter API
 */

const https = require('https');

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
     * Generate a commit message using AI
     * @param {object} options - Generation options
     * @param {string} options.apiKey - OpenRouter API key
     * @param {string} options.model - Model to use (e.g., 'deepseek/deepseek-chat')
     * @param {string} options.diffText - Git diff or file content
     * @param {string} options.fileName - Name of the file being committed
     * @param {boolean} options.useEmoji - Whether to include emoji
     * @returns {Promise<string>} Generated commit message
     */
    async function generateCommitMessage({ apiKey, model, diffText, fileName, useEmoji = true }) {
        const emojiNote = useEmoji ? 'Start with a relevant emoji that matches the change type.' : '';
        
        const systemPrompt = `You are a professional git commit message writer. Write clear, informative commit messages.

FORMAT:
- Line 1: ${emojiNote} Brief summary (max 50 chars, imperative mood: Add, Fix, Update, Remove)
- Line 2: Empty line  
- Lines 3-5 or more: Optional details if the change is significant (what/why/impact)

STYLE GUIDELINES:
- Be specific and concise about what changed
- Use active voice and present tense
- No periods at end of subject line
- Add context when helpful (e.g., "for better performance")
- For small changes: just the subject line
- For bigger changes: add 1-3 bullet points

EMOJI GUIDE (use sparingly, professional style):
feat: ✨  fix: 🐛  refactor: ♻️  docs: 📝  style: 🎨
perf: ⚡  test: 🧪  build: 📦  ci: 👷  chore: 🔧

Reply with ONLY the commit message, nothing else.`;

        const userPrompt = diffText 
            ? `Write a commit message for this diff:\n\n${diffText}`
            : `Write a commit message for changes to: ${fileName}`;

        const payload = JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.5,
            max_tokens: 300
        });

        out.appendLine(`git-autopush: AI request to ${model}...`);

        const rawResponse = await makeAPIRequest(apiKey, payload);
        const message = parseResponse(rawResponse);
        
        out.appendLine(`git-autopush: AI generated: "${message}"`);
        return message;
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
     * @returns {string} Cleaned commit message
     */
    function parseResponse(rawData) {
        const json = JSON.parse(rawData || '{}');
        
        out.appendLine(`git-autopush: API response: ${JSON.stringify(json).slice(0, 500)}`);

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

        // Clean up the response - allow multi-line messages
        let lines = raw
            .split('\n')
            .map(line => line
                .replace(/^["'`]+|["'`]+$/g, '')     // Remove quotes
                .replace(/^\*+|\*+$/g, '')           // Remove asterisks  
                .replace(/^#+\s*/, '')               // Remove markdown headers
                .trim()
            )
            .filter(line => line.length > 0);        // Remove empty lines

        // Subject line (first line) - max 72 chars
        let subject = lines[0] || '';
        if (subject.length > 72) {
            subject = subject.slice(0, 69) + '...';
        }

        // Body lines (rest) - keep up to 4 more lines for details
        const body = lines.slice(1, 5).join('\n');

        // Combine: subject + blank line + body (if body exists)
        const processed = body ? `${subject}\n\n${body}` : subject;

        return processed;
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
