---
name: Expo push token pipeline
description: Expo token registration, provider ticket validation, and native build requirements for push delivery
---

The value emitted by `addPushTokenListener` is a native APNs/FCM device token, not an `ExpoPushToken`. Only values returned by `getExpoPushTokenAsync({ projectId })` belong in an Expo push registry or should be sent to the Expo Push API.

**Why:** Persisting the native token can make the registry appear populated while Expo rejects delivery, and provider ticket errors are otherwise easy to mistake for successful sends.

**How to apply:** Validate `ExpoPushToken[...]`/`ExponentPushToken[...]` at registration and send time, disable malformed rows, inspect every Expo ticket, and ship a new native build when client registration behavior changes.