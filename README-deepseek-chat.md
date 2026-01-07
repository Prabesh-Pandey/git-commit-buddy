# DeepSeek Terminal Chat

Quick terminal chatbot that uses the DeepSeek/OpenRouter chat completions endpoint.

Prerequisites

- Node.js (14+)
- An API key available as the `DEEPSEEK_API_KEY` environment variable

Usage

1. Export your key (example):

```bash
export DEEPSEEK_API_KEY="your_key_here"
node deepseek-chat.js
```

2. Dry-run (no network call):

```bash
node deepseek-chat.js --dry-run
```

Type messages at the prompt. Use `exit` or `quit` to end the session.

Notes

- The script sends conversation history + a short system prompt to the model.
- Keep the key secret; prefer machine-scoped storage when integrating into tools.
