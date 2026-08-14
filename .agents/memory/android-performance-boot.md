---
name: Android performance boot
description: Startup lifecycle rule for shared sync and local storage maintenance in the Expo Android app
---

Shared background sync must begin from the authenticated lifecycle, not from the root layout before session restoration. Storage migrations, cache cleanup, video purges, and other maintenance should be deferred until the first route has rendered.

**Why:** Starting multiple network, SQLite, and media jobs together during Android cold start competes for the JS/native bridge, increases first-navigation latency, and can trigger duplicate reconnect work when auth later starts the same services.

**How to apply:** Keep root boot limited to routing-critical cache/auth work. Start offline message and action queues once identity is restored, and schedule nonessential storage/media work after the initial screen settles.