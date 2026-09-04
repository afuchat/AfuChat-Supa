---
name: Expo Go + Replit workflow flags
description: Required env flags for the Start application workflow to make Expo Go work on Replit
---

## Rule
Always include `EXPO_OFFLINE=1` and the explicit `--offline` CLI flag in the Start application workflow command.

**Why:** Without offline mode, Expo triggers an expo.dev auth/update check that fails in Replit's network environment. In this workspace, the environment variable alone can still produce `ApiV2Error: The bearer token is invalid`; the explicit CLI flag prevents that startup request.

**Do NOT use `CI=1`:** CI=1 breaks native bundle serving — every Expo Go connection produces a CommandError and the native bundle is never served.

## How to apply
The Start application command must include:
```
EXPO_OFFLINE=1 EXPO_NO_LAZY=1 EXPO_PACKAGER_PROXY_URL=https://$REPLIT_EXPO_DEV_DOMAIN REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_EXPO_DEV_DOMAIN EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN EXPO_PUBLIC_REPL_ID=$REPL_ID pnpm exec expo start --go --web --offline --port 5000

Use `--go` to force Expo Go mode (without it, Expo defaults to dev client and Expo Go gets rejected). `--web --port 5000` keeps the Replit webview preview alive alongside native.
```

The `@react-native+debugger-shell libglib-2.0.so.0` error that appears in logs is harmless — it's a missing system lib for the DevTools debugger only, not the app bundler.
