---
name: pnpm install missing on Replit
description: node_modules for artifacts/mobile are not pre-installed; must run CI=true pnpm install from workspace root before the app can start.
---

## Rule
After any environment reset or fresh session where the app fails to start with a PluginError, Metro resolver error, or missing module error, run:

```
CI=true pnpm install
```

from `/home/runner/workspace` (the workspace root, not artifacts/mobile).

**Why:** Replit does not persist node_modules between sessions. The pnpm workspace (pnpm-workspace.yaml) covers `artifacts/mobile`. Without `CI=true`, pnpm aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` because there is no interactive terminal.

**How to apply:** Whenever the Start application workflow fails with `PluginError: Failed to resolve plugin`, `Cannot find module`, or an unexpected missing package shim, run the install command above first. Takes ~35s with the lockfile cached.

The lockfile can already target a newer Expo SDK while stale `node_modules` still reports an older SDK. A frozen reinstall restores the lockfile versions without changing `package.json`.
