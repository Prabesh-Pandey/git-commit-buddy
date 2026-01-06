git-autopush
=============

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
