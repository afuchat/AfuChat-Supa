---
name: App language localization
description: The selected first-run language controls global UI text independently from message translation settings.
---

The first language selected before welcome is the app UI language. Keep it in the device preference for immediate startup and sync it to the profile for recovery on another device; do not derive it from the message-translation toggle.

**Why:** Users expect choosing Chinese, Swahili, or another language to change the whole interface, while message translation is a separate content preference.

**How to apply:** Route first-run users through language selection before welcome, keep global static UI text on the localization transform, and use the translation service as a fallback for supported languages without local dictionary entries.