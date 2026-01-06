# Git AutoPush on Save

VS Code extension to run a configured `git-autopush.sh` script when files matching configured globs are saved.

Settings (in `settings.json`):

- `gitAutopush.scriptPath`: path to `git-autopush.sh` (supports `${workspaceFolder}`)
- `gitAutopush.watchGlobs`: array of glob patterns to trigger on save
- `gitAutopush.dryRun`: boolean, run in dry-run mode by default

Build

```
cd extension
npm install
npm run build
```

Install locally

```
# Use vsce to package or run the extension in VS Code debugger.
```
