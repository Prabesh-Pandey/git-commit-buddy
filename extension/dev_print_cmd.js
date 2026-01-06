const path = require('path');
const fs = require('fs');

const workspaceFolder = '/home/alcyoneus/Per/Scripts';
const docPath = path.join(workspaceFolder, 'readme.md');
const rel = path.relative(workspaceFolder, docPath);

// Mimic settings: dryRun from .vscode/settings.json appears set to false in workspace
const dryRun = false;
const autoPush = false; // assume default
let scriptPath = '${workspaceFolder}/git-autopush.sh';

if (workspaceFolder) {
  scriptPath = scriptPath.replace(/\$\{workspaceFolder(:[^}]+)?\}/g, workspaceFolder);
  scriptPath = scriptPath.replace(/\$\{workspaceRoot(:[^}]+)?\}/g, workspaceFolder);
}
scriptPath = scriptPath.replace(/\$HOME/g, process.env.HOME || '');
if (scriptPath.startsWith('~')) {
  scriptPath = path.join(process.env.HOME || '', scriptPath.slice(1));
}
scriptPath = scriptPath.replace(/\$\{[^}]+\}/g, '');
if (!path.isAbsolute(scriptPath) && workspaceFolder) {
  scriptPath = path.resolve(workspaceFolder, scriptPath);
}
if (!fs.existsSync(scriptPath)) {
  const fallback = path.join(workspaceFolder || '', 'git-autopush.sh');
  if (fs.existsSync(fallback)) scriptPath = fallback;
}

const message = `Manual run: ${path.basename(rel)}`;
const quoted = `"${scriptPath.replace(/"/g, '\\"')}"`;
const noPushFlag = autoPush ? '' : '-P';
const cmd = `${quoted} ${noPushFlag} ${dryRun ? '-n' : ''} -m "${message.replace(/"/g, '\\"')}"`.trim();
console.log(cmd);
