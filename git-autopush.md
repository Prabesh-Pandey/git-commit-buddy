# git-autopush

Quick script to automatically add, commit and push changes from a repository root.

Files

- git-autopush.sh: the script (make executable)

Usage

- Make executable (if not already):

```bash
chmod +x git-autopush.sh
```

- Run with an explicit message:

```bash
./git-autopush.sh -m "Update generated files"
```

- Dry-run:

```bash
./git-autopush.sh -n -m "Test run"
```

- Push to a different remote:

```bash
./git-autopush.sh -r upstream -m "Sync"
```

Crontab example (run every hour):

```cron
0 * * * * cd /path/to/repo && /home/you/Per/Scripts/git-autopush.sh -m "Hourly auto-update"
```

Notes

- The script assumes that authentication to the remote is already set (SSH key or credential helper).
- It exits with code 0 if no changes are present.

## VS Code integration

Use the "Run on Save" extension (emeraldwalk.runonsave) to run `git-autopush.sh` automatically when files are saved. An example workspace config is provided at `.vscode/settings.json` that runs the script for common file types (Python, JS/TS, Markdown, JSON, text).

## Watcher

If you prefer a background watcher, `git-autopush-watcher.sh` uses `inotifywait` to watch paths and call `git-autopush.sh` on changes. Start it where you want to watch files:

```bash
./git-autopush-watcher.sh -m "Auto-save: %f" path/to/watch README.md
```

## .gitignore note

A `.gitignore` has been added to exclude the helper scripts and local `.vscode/settings.json` so they won't be pushed by accident.
