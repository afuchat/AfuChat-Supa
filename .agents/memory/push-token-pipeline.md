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

## Expo receipt verification

An Expo ticket with `status: "ok"` only means Expo accepted the request; Android delivery can still fail later. Poll Expo receipts and treat `SENDER_ID_MISMATCH` as an EAS/FCM credential project mismatch with the app's `google-services.json`, while `DeviceNotRegistered` means the stored device row is stale.

**Why:** Android receipts can report FCM `SenderId mismatch` or `DeviceNotRegistered` for every request even when Supabase rows are enabled and the initial provider response is successful.

**How to apply:** Keep the Firebase sender/project and EAS Android FCM service-account credentials aligned before changing client registration code; disable stale tokens after receipt errors and never label provider tickets as final delivery.