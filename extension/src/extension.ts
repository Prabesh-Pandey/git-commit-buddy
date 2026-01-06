import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as minimatch from 'minimatch';

export function activate(context: vscode.ExtensionContext) {
  // Note: read configuration inside the save handler so changes take effect immediately

  const terminal = vscode.window.createTerminal('git-autopush');
  const out = vscode.window.createOutputChannel('git-autopush-debug');

  const onSave = vscode.workspace.onDidSaveTextDocument((doc) => {
    // Read current configuration at save time so updates take effect immediately
    const config = vscode.workspace.getConfiguration('gitAutopush');
    const scriptPathCfg: string = config.get('scriptPath', '${workspaceFolder}/git-autopush.sh');
    const globs: string[] = config.get('watchGlobs', ['**/*.{py,js,ts,md,json,txt}']);
    const dryRun: boolean = config.get('dryRun', true);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    const rel = workspaceFolder ? path.relative(workspaceFolder, doc.uri.fsPath) : doc.uri.fsPath;

    // check globs
    let matched = false;
    for (const g of globs) {
      if ((minimatch as any)(rel, g)) { matched = true; break; }
    }
    if (!matched) { return; }

    // Aggressively expand vars and normalize script path
    let scriptPath = scriptPathCfg || '';
    if (workspaceFolder) {
      scriptPath = scriptPath.replace(/\$\{workspaceFolder(:[^}]+)?\}/g, workspaceFolder);
      scriptPath = scriptPath.replace(/\$\{workspaceRoot(:[^}]+)?\}/g, workspaceFolder);
    }
    // Expand environment variables like $HOME
    scriptPath = scriptPath.replace(/\$HOME/g, process.env.HOME || '');
    // Expand ~ to home
    if (scriptPath.startsWith('~')) {
      scriptPath = path.join(process.env.HOME || '', scriptPath.slice(1));
    }
    // If still contains ${...} patterns, strip them
    scriptPath = scriptPath.replace(/\$\{[^}]+\}/g, '');
    // If relative, resolve against workspace
    if (!path.isAbsolute(scriptPath) && workspaceFolder) {
      scriptPath = path.resolve(workspaceFolder, scriptPath);
    }
    // Fallback: if resolved path doesn't exist, try common workspace location
    if (!require('fs').existsSync(scriptPath)) {
      const fallback = path.join(workspaceFolder || '', 'git-autopush.sh');
      if (require('fs').existsSync(fallback)) {
        scriptPath = fallback;
      }
    }

    const timestamp = new Date().toISOString();
    const message = `Saved: ${path.basename(rel)}`;

    const quoted = `"${scriptPath.replace(/"/g, '\\"')}"`;
    const cmd = `${quoted} -m "${message.replace(/"/g, '\\"')}" ${dryRun ? '-n' : ''}`;

    out.appendLine(`git-autopush: running command -> ${cmd}`);
    out.show(true);
    terminal.show(true);
    terminal.sendText(cmd, true);
  });

  context.subscriptions.push(onSave);
}

export function deactivate() {}
