# Git AutoPush On Save (with AI Commit Messages)

A VS Code extension for solo developers and small teams that automatically commits (and optionally pushes) your code on save, with smart, professional commit messages powered by AI or customizable templates.

---

## Features

- **Auto Commit & Push**: Automatically commit (and optionally push) on file save.
- **AI-Powered Commit Messages**: Uses OpenRouter (DeepSeek, Gemini, etc.) to generate clear, conventional commit messages from your code changes.
- **Smart Fallbacks**: If AI is unavailable, uses a rich set of hand-crafted commit messages by file type, folder, or filename.
- **Emoji Toggle**: Choose whether to include emojis in commit messages (AI and fallback).
- **Gamification**: Tracks your commit streak, achievements, and stats with a beautiful dashboard.
- **Status Bar Integration**: See your streak, stats, and quick actions in the VS Code status bar.
- **Sensitive File Protection**: Never auto-commits secrets or protected branches.
- **Highly Configurable**: Control globs, dry run, protected branches, and more.

---

## Quick Start

1. **Install**: Place the extension in your `.vscode/extensions` folder or use the VSIX package.
2. **Set API Key**: Press `Ctrl+Shift+P` → `Git AutoPush: Set API Key` and paste your [OpenRouter](https://openrouter.ai/) key.
3. **Enable Auto Commit**: Toggle `Git Autopush: Auto Commit` in settings or via the status bar menu.
4. **(Optional) Enable Auto Push**: Toggle `Git Autopush: Auto Push` for automatic git push after commit.
5. **Save a file**: Watch your code get committed with a smart message!

---

## Configuration

All options are available in VS Code settings (search for "Git Autopush"):

- **Auto Commit**: Enable/disable auto-commit on save
- **Auto Push**: Enable/disable auto-push after commit
- **Dry Run**: Preview git commands without running them
- **Show Stats In Status Bar**: Show streak and stats in the status bar
- **Use Emoji**: Toggle emojis in commit messages (AI and fallback)
- **Watch Globs**: File patterns to watch for auto-commit
- **Protected Branches**: Never push to these branches
- **Sensitive File Globs**: Never commit secrets or sensitive files
- **AI Model**: Choose your OpenRouter model (e.g., `deepseek/deepseek-chat`)
- **Commit Style**: Choose `auto` (intelligent), `concise`, or `detailed`
- **Conventional Commits**: Toggle conventional commit format (feat:, fix:, etc.)
- **Include Scope**: Auto-detect and include scope (e.g., `feat(auth): ...`)

---

## Commit Message Logic

### 🧠 Intelligent Context-Aware Messages (NEW!)

The AI now analyzes your changes to generate the perfect commit message:

| Change Size          | Message Style                                  |
| -------------------- | ---------------------------------------------- |
| 1-5 lines (typo fix) | Short one-liner: `fix: correct typo in button` |
| 6-50 lines (feature) | Subject + brief body with bullet points        |
| 50+ lines (refactor) | Detailed message with full context             |

### Features

- **Smart Complexity Detection**: Analyzes diff size, file changes, and patterns
- **Change Type Detection**: Automatically identifies feat/fix/refactor/docs/test
- **Scope Extraction**: Detects scope from file paths (auth, api, components, etc.)
- **Breaking Change Alerts**: Warns about breaking changes in commits
- **Conventional Commits**: Follows the conventional commit specification

### Modes

- **Auto (Default)**: AI intelligently picks the right message length
- **Concise**: Always short, single-line messages
- **Detailed**: Always includes body with bullet points

---

## Achievements & Stats

- **Achievements**: Earn badges for first commit, streaks, and productivity milestones.
- **Stats Panel**: View your total commits, streaks, and unlocked achievements in a beautiful webview.
- **Status Bar**: See your current streak and stats at a glance.

---

## Security & Safety

- **Sensitive File Protection**: Never auto-commits `.env`, keys, or secrets (configurable).
- **Protected Branches**: Never pushes to `main`, `master`, or custom branches you specify.
- **Dry Run Mode**: Safely preview all git commands before running.

---

## Advanced Usage

- **Custom Commit Templates**: Edit `commit-messages.json` to add your own message templates.
- **Manual Commands**: Use the status bar or `Ctrl+Shift+P` for quick actions (undo, push, stats, etc.).
- **Multiple Models**: Supports any OpenRouter model (DeepSeek, Gemini, etc.).

---

## Requirements

- **Git** must be installed and available in your PATH.
- **VS Code** 1.70+
- **OpenRouter API Key** (for AI commit messages)

---

## Credits

- Built by Prabesh Pandey and contributors
- Uses [OpenRouter](https://openrouter.ai/) for AI commit message generation
- Inspired by the best of solo developer workflows

---

## License

MIT License. See `LICENSE.txt` for details.

---

## Settings (in `settings.json`):

- `gitAutopush.scriptPath`: path to `git-autopush.sh` (supports `${workspaceFolder}`)
- `gitAutopush.watchGlobs`: array of glob patterns to trigger on save
- `gitAutopush.dryRun`: boolean, run in dry-run mode by default

---

## Build

```
cd extension
npm install
npm run build
```

---

## Install locally

```
# Use vsce to package or run the extension in VS Code debugger.
```
