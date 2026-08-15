---
name: Navigation responsiveness
description: The app has two separate navigation duplicate-protection layers that must stay aligned
---

Navigation duplicate protection is implemented in both the direct Expo Router patch and the `navUtils` helpers used by `SafePressable`/`SafeTouchableOpacity`. Different destinations should remain immediately selectable; only repeated identical actions need a short throttle.

**Why:** Updating only the direct router patch leaves high-traffic SafePressable buttons subject to the older global cooldown, so taps can still feel unresponsive even when direct router calls are fast.

**How to apply:** When changing navigation throttling, inspect and update both layers, preserve duplicate-tap protection, and prefer action-keyed short windows over a global lock that blocks unrelated destinations.