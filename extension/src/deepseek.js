"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateCommitMessage = void 0;
/**
 * DeepSeek helper: generate a concise commit message from input text.
 * Uses the OpenRouter / DeepSeek chat completions endpoint.
 */
async function generateCommitMessage(promptText, options) {
    var _a, _b, _c, _d, _e, _f, _g;
    const apiKey = (options === null || options === void 0 ? void 0 : options.apiKey) || process.env.DEEPSEEK_API_KEY;
    if (!apiKey)
        throw new Error('DeepSeek API key not provided');
    const model = (options === null || options === void 0 ? void 0 : options.model) || 'deepseek/deepseek-r1-0528:free';
    const timeoutMs = (_a = options === null || options === void 0 ? void 0 : options.timeoutMs) !== null && _a !== void 0 ? _a : 15000;
    const systemPrompt = `You are a helpful assistant that writes concise, conventional git commit messages. Return a short subject line (<=50 chars) followed by an optional body <=72 chars per line. Do NOT include surrounding quotes.`;
    const userPrompt = `Generate a commit message for the following changes:\n\n${promptText}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                ...((options === null || options === void 0 ? void 0 : options.referer) ? { 'HTTP-Referer': options.referer } : {}),
                ...((options === null || options === void 0 ? void 0 : options.title) ? { 'X-Title': options.title } : {}),
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(`DeepSeek request failed: ${res.status} ${res.statusText} ${txt}`);
        }
        const json = await res.json();
        // Typical OpenRouter response: { choices: [ { message: { content: '...' } } ] }
        const raw = (_g = (_e = (_d = (_c = (_b = json === null || json === void 0 ? void 0 : json.choices) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.message) === null || _d === void 0 ? void 0 : _d.content) !== null && _e !== void 0 ? _e : (_f = json === null || json === void 0 ? void 0 : json.result) === null || _f === void 0 ? void 0 : _f.content) !== null && _g !== void 0 ? _g : JSON.stringify(json);
        // Split into subject and body by first blank line or first newline.
        let subject = raw.trim();
        let body = undefined;
        const parts = raw.split(/\n\n|\n/).map((s) => s.trim()).filter(Boolean);
        if (parts.length > 1) {
            subject = parts[0];
            body = parts.slice(1).join('\n\n');
        }
        else {
            // If subject too long, try to shorten by truncation to first line or 72 chars
            subject = subject.split('\n')[0].slice(0, 72).trim();
        }
        return { subject, body, raw };
    }
    catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}
exports.generateCommitMessage = generateCommitMessage;
exports.default = generateCommitMessage;
