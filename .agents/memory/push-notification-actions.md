---
name: Push notification actions
description: Requirements for actionable Expo push notifications and message targeting.
---

Actionable Expo notifications require both sides: the native client must register the category and listen for responses, while the sender must include the matching category ID and message target metadata in the push payload.

**Why:** A plain push token registry and title/body payload can display notifications but cannot show Reply/Mark as read/Open actions or identify which chat/message an action belongs to.

**How to apply:** Keep message category registration and cold-start response handling in the client; preserve chatId/messageId in the sender payload; ship a new native build because existing installs do not receive runtime category code changes.