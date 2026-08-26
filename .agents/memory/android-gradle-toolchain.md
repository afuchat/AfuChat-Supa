---
name: Local Android Gradle verification
description: Environment-specific limitation encountered when compiling generated Expo Android projects in the Replit container.
---

The local Android Gradle wrapper may fail before evaluating the app with a `JvmVendorSpec IBM_SEMERU` `NoSuchFieldError` from the Foojay toolchain resolver. This is an environment/toolchain mismatch, not an application source diagnostic.

**Why:** The generated Expo Android project can be valid while the container's Gradle resolver crashes before Kotlin or Android compilation starts.

**How to apply:** Validate Expo config and generated manifest locally, but use the configured EAS Android build for authoritative native compilation when this resolver error occurs.