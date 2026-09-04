---
name: Responsive layout and webfont fallback
description: Durable constraints for keeping AfuChat layouts stable across resize and browser font-loading conditions.
---

Use `useWindowDimensions` for screen-derived layout values in resize-sensitive screens instead of module-level `Dimensions.get("window")` constants. Keep the web font gate bounded so a delayed font request cannot block the app; never use a broad CSS font override that can replace icon fonts.

**Why:** The web preview and AfuMatch screens showed different failures: offline font resolution could block the whole preview, a broad fallback could turn Ionicons into square glyphs, and one-time screen measurements became stale after resize or rotation.

**How to apply:** When adding a new screen with width/height-derived cards, grids, tap zones, or sheets, derive those values inside the component. When changing the web font gate or global CSS, verify both a cold reload and the settled onboarding screen.