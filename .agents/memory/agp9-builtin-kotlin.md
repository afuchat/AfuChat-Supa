---
name: AGP 9 built-in Kotlin compatibility
description: The AGP 9 Android toolchain conflicts with the legacy external Kotlin Gradle plugin in generated Expo app projects.
---

## Rule

When overriding an Expo Android project to AGP 9, set `android.builtInKotlin=false` in generated `gradle.properties` and keep Expo's external Kotlin plugin application/classpath intact. Keep Expo's `kotlinVersion` setting for SDK/KSP compatibility.

**Why:** AGP 9 includes Kotlin support, but Expo and its native modules apply the external Kotlin plugin in multiple modules. Removing it only from the app module lets the Expo library plugin fail later with the same duplicate `kotlin` extension error.

**How to apply:** Add the opt-out in the CNG/EAS config plugin, not only in the ignored `android/` output. Verify generated `gradle.properties` contains `android.builtInKotlin=false`, the external Kotlin plugin remains available, and ProGuard uses the optimized template.