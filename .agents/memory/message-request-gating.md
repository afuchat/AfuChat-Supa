---
name: Message request gating
description: The offline-safe rule for direct-chat composer access before recipient acceptance.
---

Direct message requests must fail closed: the composer is hidden and the lock notice is shown until the recipient follows the sender or replies. Relationship checks must never turn the composer on merely because the network is unavailable or a request is still loading.

**Why:** The previous async check initialized as unlocked, so the input bar could briefly appear on chat open and remain incorrectly available during offline starts.

**How to apply:** Use locally cached replies and a per-user-pair accepted marker to unlock offline. Treat follow/reply query failures as locked, recheck after connectivity returns, and leave groups, channels, AI chats, and personal notes outside this gate.