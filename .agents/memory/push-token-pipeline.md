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

**How to apply:** Keep the Firebase sender/project and EAS Android FCM service-account credentials aligned before changing client registration code. If the credentials already match, assume tokens from an older APK/sender until a clean reinstall proves otherwise; disable stale tokens after receipt errors and never label provider tickets as final delivery.

If a newly registered token from a clean/current install still returns `SENDER_ID_MISMATCH`, the dashboard credential alone is not proof that the installed artifact uses the same Firebase sender. Re-download `google-services.json`, rebuild with an incremented version, and verify the artifact/build project before debugging Supabase.

**Why:** A fresh registration can preserve the same failure when the APK was built from a different Firebase config or an older EAS credential/build artifact.

**How to apply:** Treat fresh-token `SENDER_ID_MISMATCH` as an APK/EAS credential alignment problem; do not purge working Supabase rows or rewrite client token registration first.