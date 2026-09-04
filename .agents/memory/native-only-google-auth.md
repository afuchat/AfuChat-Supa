---
name: Native-only Google auth
description: The project decision and boundary for Google authentication after removing web Google login.
---

Google authentication is native-only in the app. The Android Google SDK obtains an ID token and Supabase receives it through signInWithIdToken. The Supabase Google provider and its server-side credentials remain enabled; the mobile bundle must not contain the provider secret.

**Why:** Browser Google login and One Tap were not part of the mobile authentication experience and created redirect/fallback paths that could bypass the intended native flow.

**How to apply:** Keep the native Google SDK and Supabase ID-token exchange. Do not re-add Google One Tap, web Google signInWithOAuth, or Google browser callback handling. The current native implementation is Android-only unless iOS native configuration is added separately.