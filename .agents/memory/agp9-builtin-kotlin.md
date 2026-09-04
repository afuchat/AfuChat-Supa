---
name: AGP 9 built-in Kotlin compatibility
description: The AGP 9 Android toolchain conflicts with the legacy external Kotlin Gradle plugin in generated Expo app projects.
---

## Rule

When overriding an Expo Android project to AGP 9, do not apply `org.jetbrains.kotlin.android` in the app module and do not keep the external `kotlin-gradle-plugin` buildscript classpath. Keep Expo's `kotlinVersion` setting for SDK/KSP compatibility.

**Why:** AGP 9 includes Kotlin support. Applying the legacy plugin on top of it causes project evaluation to fail before compilation with `Cannot add extension with name 'kotlin', as there is an extension already registered with that name`.

**How to apply:** Make the removal in the CNG/EAS config plugin that edits generated Gradle files, not only in the ignored `android/` output. Verify the generated app has no external Kotlin plugin application/classpath before submitting an EAS build.