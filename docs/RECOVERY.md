# Recovery

## In the app

**Self-Test & Recovery** (launcher → System) runs functional self-tests and offers targeted resets. Each reset says what it removes and keeps, and asks for confirmation:

| Action | Removes | Keeps |
| --- | --- | --- |
| Restore default settings | Appearance, dock, notification and accessibility preferences | Files, app data, layout |
| Reset window layout | Open windows and saved layout | Files, preferences |
| Reset app data | Favourites, recents, browser data, service config, Aegis policy and audit, assistant activity, config history | Files, preferences |
| Reset the virtual filesystem | Files under `/home` and `/tmp` | Preferences, app data |
| Erase all PyxisOS data | Everything stored by PyxisOS-Web in this browser | Nothing |

Corrupted or newer-schema records are never silently discarded: the original is kept in storage under `<key>.backup` and the boot log and System Doctor report it.

Before a reset, export a backup: **Settings → Session & data → Export**.

## Source code

The state before the 36-feature expansion is commit `bc2eb78` on `main`. A verified local backup was made before any change (outside the repository, with a git bundle, SHA-256 manifest and its own `RECOVERY.md`).

```bash
git log --oneline bc2eb78..HEAD          # what changed since
git switch -c restore-original bc2eb78  # inspect the original without touching main
npm ci && npm run build                  # rebuild it
```

Never copy a backup over a working copy without checking `git status` first.
