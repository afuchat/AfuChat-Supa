---
name: FCM project authority
description: Keep direct-FCM sender project selection aligned with the Android google-services sender ID
---

The Firebase project used by the direct-FCM sender must be explicitly aligned with the project embedded in the Android `google-services.json`. A copied service-account JSON can carry a stale `project_id`; the configured sender project is authoritative.

**Why:** Preview delivery can work while a Play-installed AAB reports `SenderId mismatch` when server credentials and the installed build resolve to different Firebase projects.

**How to apply:** Verify the Android package and sender ID, set the matching Firebase project in the server environment, keep the service account authorized for that project, redeploy the sender, and retest with a clean install so an old token is not reused.