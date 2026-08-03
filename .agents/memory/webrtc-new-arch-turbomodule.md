---
name: WebRTC New Architecture TurboModule injection
description: react-native-webrtc v124 throws at module-eval when NativeModules.WebRTCModule is null (New Arch production). Fix is to inject from TurboModuleRegistry before requiring the package.
---

## The Problem

`react-native-webrtc@124` does this at module-eval time in `src/index.ts` (Metro's resolved entry via the `react-native` package.json field):

```js
const { WebRTCModule } = NativeModules;
if (WebRTCModule === null) {
  throw new Error(`WebRTC native module not found...`);
}
```

In New Architecture production builds (RN 0.73+), `NativeModules.WebRTCModule` is `null` — TurboModules don't auto-register in the legacy NativeModules bridge. The throw is caught by our outer `try/catch`, setting `WEBRTC_AVAILABLE = false`. Every call tap then throws `"WEBRTC_UNAVAILABLE"` which is swallowed by CallContext as `"Could not start call"`.

**Why:** react-native-webrtc v124 does not inject itself into NativeModules in New Architecture. All internal `WebRTCModule.xxx` method calls also rely on the same captured reference.

## The Fix

In `lib/callEngine.ts`, before `require("react-native-webrtc")`:

1. Import `TurboModuleRegistry` from `react-native`
2. If `NativeModules.WebRTCModule == null`, call `TurboModuleRegistry.get("WebRTCModule")`
3. If TurboModuleRegistry has it, inject it into `NativeModules.WebRTCModule`
4. If TurboModuleRegistry also returns null → truly unavailable (Expo Go) → return null

**How to apply:** This must run BEFORE `require("react-native-webrtc")` evaluates, so the injected module is picked up by all internal files. Keep it in the `_RTC` IIFE initialization in callEngine.ts.

**Why not postinstall patch:** Even if we remove the null-throw in index.ts, all the individual files (RTCPeerConnection.ts, MediaDevices.ts, etc.) also capture `const { WebRTCModule } = NativeModules` at their own module-eval time — they would all get null and fail.

## Expo Go Behavior

In Expo Go, `TurboModuleRegistry.get("WebRTCModule")` also returns null (the module isn't bundled in Expo Go). So `_RTC = null`, `WEBRTC_AVAILABLE = false`, and calls are gracefully disabled — correct behavior.
