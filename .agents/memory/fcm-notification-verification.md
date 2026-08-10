---
name: FCM notification verification
description: Durable checks for verifying the AfuChat Supabase and Expo FCM push pipeline.
---

The push pipeline is considered configured only when the live Supabase project has `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT_KEY` secrets, `pg_net`, native and Expo token columns, notification preferences, the preferences helper RPC, push triggers for messages/calls/notifications/orders, and deployed `push-notification-trigger` plus `register-push-token` functions.

**Why:** The trigger endpoint intentionally returns a successful skipped response for health or unsupported events, and it can fall back to Expo Push tokens when Firebase credentials are absent. A public HTTP 200 alone therefore does not prove FCM delivery.

**How to apply:** Verify metadata and secret names through the Supabase Management API, query schema metadata over HTTPS, deploy the two functions with the secure Supabase access token, then test native delivery using an Android development/standalone build. Expo Go on Android with SDK 55 skips remote push registration.