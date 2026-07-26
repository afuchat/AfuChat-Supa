---
name: Supabase realtime channel ownership
description: Lifecycle rule for Supabase Realtime channels used by chat screens and draft-to-real chat transitions.
---

Configure all `postgres_changes` and broadcast handlers on a Supabase channel before calling `subscribe()`. A logical channel must also have one lifecycle owner; transitional states such as draft-to-real chat creation should hand ownership to the normal screen effect rather than creating a second channel with the same name.

**Why:** Supabase rejects adding a Postgres Changes callback after a channel has subscribed. Duplicate channel setup during a draft chat transition caused a runtime crash on Android.

**How to apply:** Keep channel creation, handler registration, subscription, and cleanup together in one effect or service. If an ID is created asynchronously, serialize creation and let the ID-driven lifecycle create the channel once.