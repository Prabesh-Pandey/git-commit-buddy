/**
 * DeepSeek helper: generate a concise commit message from input text.
 * Uses the OpenRouter / DeepSeek chat completions endpoint.
 */
export async function generateCommitMessage(
  promptText: string,
  options?: {
    apiKey?: string;
    model?: string;
    referer?: string;
    title?: string;
    timeoutMs?: number;
  }
): Promise<{ subject: string; body?: string; raw: string }> {
  const apiKey = options?.apiKey || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DeepSeek API key not provided');

  const model = options?.model || 'deepseek/deepseek-r1-0528:free';
  const timeoutMs = options?.timeoutMs ?? 15_000;

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
        ...(options?.referer ? { 'HTTP-Referer': options.referer } : {}),
        ...(options?.title ? { 'X-Title': options.title } : {}),
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
    const raw =
      json?.choices?.[0]?.message?.content ?? json?.result?.content ?? JSON.stringify(json);

    // Split into subject and body by first blank line or first newline.
    let subject = raw.trim();
    let body: string | undefined = undefined;

    const parts = raw.split(/\n\n|\n/).map((s: string) => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      subject = parts[0];
      body = parts.slice(1).join('\n\n');
    } else {
      // If subject too long, try to shorten by truncation to first line or 72 chars
      subject = subject.split('\n')[0].slice(0, 72).trim();
    }

    return { subject, body, raw };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

export default generateCommitMessage;
