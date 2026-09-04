---
name: Local Android Gradle verification
description: Environment-specific limitation encountered when compiling generated Expo Android projects in the Replit container.
---

The local Android Gradle wrapper may fail before evaluating the app with a `JvmVendorSpec IBM_SEMERU` `NoSuchFieldError` from the Foojay toolchain resolver. This is an environment/toolchain mismatch, not an application source diagnostic.

**Why:** The generated Expo Android project can be valid while the container's Gradle resolver crashes before Kotlin or Android compilation starts.

**How to apply:** Validate Expo config and generated manifest locally, but use the configured EAS Android build for authoritative native compilation when this resolver error occurs.

The Gradle distribution URL must use the full published version. `gradle-9.1-bin.zip` returns 404; Gradle 9.1 is published as `gradle-9.1.0-bin.zip`. For this SDK 55 app, `gradle-9.0.0-bin.zip` is the known successful wrapper version.

**Why:** A custom wrapper pin caused EAS to fail immediately in `RUN_GRADLEW` before any Android task ran, and EAS reported only `EAS_BUILD_UNKNOWN_GRADLE_ERROR`.

**How to apply:** When EAS fails before Gradle startup, inspect the wrapper distribution URL first and compare it with a known successful build before changing app or dependency code.