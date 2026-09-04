---
name: Responsive layout and webfont fallback
description: Durable constraints for keeping AfuChat layouts stable across resize and browser font-loading conditions.
---

Use `useWindowDimensions` for screen-derived layout values in resize-sensitive screens instead of module-level `Dimensions.get("window")` constants. Keep the web document's typography backed by a system fallback so a delayed font request cannot make labels disappear or change the initial layout.

**Why:** The web preview and AfuMatch screens showed different failures: cold font loads could render assets and emoji while hiding font-backed labels, and one-time screen measurements became stale after resize or rotation.

**How to apply:** When adding a new screen with width/height-derived cards, grids, tap zones, or sheets, derive those values inside the component. When changing the web font gate or global CSS, verify both a cold reload and the settled onboarding screen.