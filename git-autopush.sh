#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<EOF
Usage: ${0##*/} [-n] [-r remote] [-m message]

Options:
  -m message   Commit message (default: "Auto-update: <iso-timestamp>")
  -r remote    Remote name to push to (default: origin)
  -n           Dry-run: show what would happen but don't commit or push
  -h           Show this help
EOF
}

DRY_RUN=0
REMOTE=origin
MSG=""

while getopts ":m:r:nh" opt; do
  case ${opt} in
    m) MSG="$OPTARG" ;; 
    r) REMOTE="$OPTARG" ;;
    n) DRY_RUN=1 ;;
    h) usage; exit 0 ;;
    :) echo "Option -$OPTARG requires an argument." >&2; usage; exit 1 ;;
    \?) echo "Invalid option: -$OPTARG" >&2; usage; exit 1 ;;
  esac
done

# Determine repo root
repo_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
if [[ -z "$repo_root" ]]; then
  echo "Not inside a git repository." >&2
  exit 1
fi
cd "$repo_root"

# Determine current branch (or detached HEAD short SHA)
branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD)

# Default commit message
if [[ -z "$MSG" ]]; then
  MSG="Auto-update: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
fi

echo "Repository: $repo_root"
echo "Branch: $branch"
echo "Remote: $REMOTE"

echo "Staging changes..."
if [[ $DRY_RUN -eq 1 ]]; then
  echo "DRY RUN: git add -A"
else
  git add -A
fi

# If nothing staged, exit nicely
if git diff --cached --quiet; then
  echo "No changes to commit." 
  exit 0
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "DRY RUN: git commit -m \"$MSG\""
else
  git commit -m "$MSG"
fi

if [[ $DRY_RUN -eq 1 ]]; then
  echo "DRY RUN: git push $REMOTE $branch"
else
  echo "Pushing to $REMOTE/$branch..."
  git push "$REMOTE" "$branch"
fi

echo "Done."