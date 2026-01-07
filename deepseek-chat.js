#!/usr/bin/env node
// Simple terminal chatbot using DeepSeek / OpenRouter chat completions
// Usage:
//   DEEPSEEK_API_KEY=your_key node deepseek-chat.js
//   node deepseek-chat.js --dry-run   # don't call network, just verify startup

const https = require('https');
const readline = require('readline');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const apiKey = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_KEY || '';
const endpoint = process.env.DEEPSEEK_URL || 'https://openrouter.ai/api/v1/chat/completions';
const model = process.env.DEEPSEEK_MODEL || 'deepseek/deepseek-r1-0528:free';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

const systemPrompt = `You are a helpful assistant that writes concise, helpful replies. Keep answers concise where possible.`;
const conversation = [ { role: 'system', content: systemPrompt } ];

function callDeepSeek(messages) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(endpoint);
      const payload = JSON.stringify({ model, messages });
      const opts = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + (url.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 15000
      };

      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', (c) => data += c);
        res.on('end', () => {
          try {
            const json = JSON.parse(data || '{}');
            // Try multiple possible fields returned by different providers
            const candidates = [];
            if (json.choices && Array.isArray(json.choices)) {
              // OpenRouter-like: choices[0].message.content
              try { candidates.push(json.choices[0].message.content); } catch (e) { }
              try { candidates.push(json.choices[0].text); } catch (e) { }
            }
            if (json.output && Array.isArray(json.output)) {
              try { candidates.push(json.output[0].content); } catch (e) { }
            }
            try { candidates.push(json.commit_message); } catch (e) { }
            try { candidates.push(json.message); } catch (e) { }
            try { candidates.push(json.result); } catch (e) { }
            // Fallback: any string fields in the top-level
            for (const k of Object.keys(json)) {
              if (typeof json[k] === 'string') candidates.push(json[k]);
            }

            const raw = candidates.find(c => typeof c === 'string' && c.trim().length > 0) ?? JSON.stringify(json);
            resolve(String(raw));
          } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(new Error('DeepSeek request timeout')); });
      req.write(payload);
      req.end();
    } catch (e) { reject(e); }
  });
}

async function handleLine(line) {
  const trimmed = line.trim();
  if (!trimmed) { return; }
  if (trimmed === 'exit' || trimmed === 'quit') {
    console.log('Goodbye.');
    process.exit(0);
  }

  conversation.push({ role: 'user', content: trimmed });

  if (dryRun) {
    console.log('[dry-run] would send to DeepSeek:', trimmed);
    conversation.push({ role: 'assistant', content: '[dry-run] (no network)' });
    return;
  }

  if (!apiKey) {
    console.error('DEEPSEEK_API_KEY not set. Set it in env and restart.');
    process.exit(2);
  }

  try {
    const reply = await callDeepSeek(conversation);
    const text = String(reply).trim();
    console.log('\nDeepSeek:', text.replace(/\n/g, '\n'));
    conversation.push({ role: 'assistant', content: text });
  } catch (e) {
    console.error('Error calling DeepSeek:', e.message || e);
  }
}

console.log('DeepSeek terminal chat — type a message, or "exit" to quit.');
if (dryRun) console.log('[dry-run] mode — no network calls will be made.');
rl.setPrompt('You> ');
rl.prompt();
rl.on('line', async (line) => {
  await handleLine(line);
  rl.prompt();
});
rl.on('close', () => { console.log('Goodbye.'); process.exit(0); });
