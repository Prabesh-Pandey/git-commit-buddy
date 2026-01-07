import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import * as minimatch from 'minimatch';
import generateCommitMessage from './deepseek';

export function activate(context: vscode.ExtensionContext) {
  // Note: read configuration inside the save handler so changes take effect immediately

  const terminal = vscode.window.createTerminal('git-autopush');
  const out = vscode.window.createOutputChannel('git-autopush-debug');

  const onSave = vscode.workspace.onDidSaveTextDocument(async (doc) => {
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

    // Attempt to generate a better commit message via DeepSeek if enabled.
    // Fall back to a conservative "Saved: <file>" message when AI is disabled or fails.
    let finalMessage = `Saved: ${path.basename(rel)}`;
    try {
      const aiEnabled: boolean = config.get('ai.generateCommitMessage', false) && config.get('ai.enabled', false);
      if (aiEnabled) {
        const deepseekApiKey: string = config.get('ai.deepseekApiKey', '') || config.get('ai.apiKey', '') || process.env.DEEPSEEK_API_KEY || '';
        const deepseekModel: string = config.get('ai.deepseekModel', 'deepseek/deepseek-r1-0528:free');

        const fileText = doc.getText().slice(0, 2000); // limit size
        const prompt = `File: ${rel}\n\nContents excerpt:\n${fileText}`;
        const gen = await generateCommitMessage(prompt, { apiKey: deepseekApiKey || undefined, model: deepseekModel });

        // Prompt the user to confirm/edit the generated subject
        const subject = gen.subject || `Saved: ${path.basename(rel)}`;
        const edited = await vscode.window.showInputBox({
          prompt: 'Confirm commit subject',
          value: subject,
          placeHolder: 'Enter commit subject',
          ignoreFocusOut: true,
        });

        if (typeof edited === 'undefined') {
          // User cancelled the prompt – abort.
          out.appendLine('git-autopush: commit aborted by user (prompt cancelled)');
          return;
        }

        // Combine subject and body if present
        finalMessage = edited.trim();
        if (gen.body && gen.body.trim()) {
          finalMessage += '\n\n' + gen.body.trim();
        }
      }
    } catch (err: any) {
      out.appendLine(`git-autopush: DeepSeek message generation failed: ${err?.message || String(err)}`);
      out.appendLine('git-autopush: falling back to default message');
    }

    const quoted = `"${scriptPath.replace(/"/g, '\\"')}"`;
    const cmd = `${quoted} -m "${finalMessage.replace(/"/g, '\\"')}" ${dryRun ? '-n' : ''}`;

    out.appendLine(`git-autopush: running command -> ${cmd}`);
    out.show(true);
    terminal.show(true);
    terminal.sendText(cmd, true);
  });

  context.subscriptions.push(onSave);
}

export function deactivate() {}
