---
name: Expo push token pipeline
description: Expo token registration, provider ticket validation, and native build requirements for push delivery
---

The value emitted by `addPushTokenListener` is a native APNs/FCM device token, not an `ExpoPushToken`. Only values returned by `getExpoPushTokenAsync({ projectId })` belong in an Expo push registry or should be sent to the Expo Push API.

**Why:** Persisting the native token can make the registry appear populated while Expo rejects delivery, and provider ticket errors are otherwise easy to mistake for successful sends.

**How to apply:** Validate `ExpoPushToken[...]`/`ExponentPushToken[...]` at registration and send time, disable malformed rows, inspect every Expo ticket, and ship a new native build when client registration behavior changes.

## Edge-function auditability

Keep all values used by the push sender derived from explicitly named request fields, and run a deployed-function smoke check after every push-function change. A runtime symbol error before the audit write can make notifications disappear while leaving no delivery log.

**Why:** The live registry had enabled Android devices and successful registrations, but zero delivery records because the sender referenced an undeclared avatar variable before its audit block.

**How to apply:** Treat “registered devices but no delivery rows” as a sender invocation/runtime failure first; inspect deployed Edge Function code and redeploy it before changing client token or Android channel logic.