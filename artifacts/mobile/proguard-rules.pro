# ============================================================================
# AfuChat — Custom R8/ProGuard rules
# Applied to: android release builds (APK + AAB)
# Engine: R8 (full mode via enableProguardInReleaseBuilds: true)
#
# These rules are injected into android/app/proguard-rules.pro at prebuild
# time by the withProguardRules config plugin.  They supplement the Expo /
# React Native default rules already provided by each library's own
# consumer-rules.pro / proguard.txt.  Only rules that are genuinely missing
# from those defaults are listed here.
# ============================================================================

# ─── Crash-report readability ────────────────────────────────────────────────
# Keep file name + line numbers in the mapping so Google Play Console and
# Sentry can display readable stack traces.
-keepattributes SourceFile,LineNumberTable

# Replace the actual source-file path with the opaque string "SourceFile" so
# internal package structure is not leaked in crash reports, while line
# numbers remain intact for deobfuscation.
-renamesourcefileattribute SourceFile

# ─── Annotations (required by many reflection-heavy libraries) ───────────────
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# ─── Hermes JS engine ────────────────────────────────────────────────────────
# Hermes uses JNI; these classes are called from native and must survive.
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# ─── React Native bridge + module registry ───────────────────────────────────
# RN's @DoNotStrip annotation and JSI bridge classes must be preserved.
-keep class com.facebook.react.** { *; }
-keep @com.facebook.proguard.annotations.DoNotStrip class * { *; }
-keep @com.facebook.proguard.annotations.DoNotStripAny class * { *; }
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
}

# SoLoader loads JNI .so libraries; its registry must not be renamed.
-keep class com.facebook.soloader.** { *; }

# ─── OkHttp + Okio (React Native networking, Supabase REST, R2 uploads) ──────
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**

# ─── WebSocket (Supabase Realtime, chat subscriptions) ───────────────────────
# Supabase Realtime uses the OkHttp WebSocket client.  Its listener interface
# is created reflectively; keep the interface and all implementations.
-keep interface okhttp3.WebSocketListener { *; }
-keep class ** implements okhttp3.WebSocketListener { *; }

# ─── Kotlin stdlib + coroutines ──────────────────────────────────────────────
-keep class kotlin.** { *; }
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**
-keepclassmembers class **$WhenMappings { <fields>; }
-keepclassmembers class kotlin.Lazy { ** get(); }
-keep class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# ─── Kotlinx serialization (Supabase client, Ktor) ───────────────────────────
# Supabase-kt serializes Kotlin data classes; the generated serializer
# companion objects are created reflectively at runtime.
-keep class kotlinx.serialization.** { *; }
-keepclassmembers @kotlinx.serialization.Serializable class ** {
    *** Companion;
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclasseswithmembers class ** {
    @kotlinx.serialization.SerialName <fields>;
}
-dontwarn kotlinx.serialization.**

-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# ─── Expo modules core ───────────────────────────────────────────────────────
# All Expo modules register themselves via the ExpoModulesPackageList generated
# class; keep everything under the expo namespace.
-keep class expo.** { *; }
-keep class expo.modules.** { *; }

# expo-modules-core 55.x removed KeepAwakeManager from the interfaces package,
# but expo-av's FullscreenVideoPlayer$KeepScreenOnUpdater still references it
# by name in its compiled bytecode.  The class is never instantiated at runtime
# (expo-av has its own keep-screen-on logic), so suppressing the missing-class
# warning is safe and is the fix recommended in the generated missing_rules.txt.
-dontwarn expo.modules.core.interfaces.services.KeepAwakeManager

# Expo SecureStore — calls Android Keystore APIs via JNI reflection.
-keep class expo.modules.securestore.** { *; }

# Expo SQLite — JNI bridge to SQLite; function names are looked up by the C layer.
-keep class expo.modules.sqlite.** { *; }

# Expo Camera / AV / Video
-keep class expo.modules.camera.** { *; }
-keep class expo.modules.av.** { *; }
-keep class expo.modules.video.** { *; }

# Expo Location
-keep class expo.modules.location.** { *; }

# Expo Contacts
-keep class expo.modules.contacts.** { *; }

# Expo Local Authentication (biometrics)
-keep class expo.modules.localauthentication.** { *; }

# ─── MMKV v3 (key-value storage; JSI bridge, native symbol lookup) ────────────
-keep class com.tencent.mmkv.** { *; }
-dontwarn com.tencent.mmkv.**

# ─── React Native Track Player (foreground music service + MediaSession) ──────
# RNTP creates a foreground Service and binds a MediaBrowserService that Android
# discovers by class name; renaming either breaks music playback entirely.
-keep class com.doublesymmetry.trackplayer.** { *; }
-dontwarn com.doublesymmetry.trackplayer.**

# ─── Reanimated 4 (Worklets / Fabric shared values) ─────────────────────────
-keep class com.swmansion.reanimated.** { *; }
-dontwarn com.swmansion.reanimated.**

# ─── Gesture Handler ─────────────────────────────────────────────────────────
-keep class com.swmansion.gesturehandler.** { *; }
-dontwarn com.swmansion.gesturehandler.**

# ─── React Native Screens ────────────────────────────────────────────────────
-keep class com.swmansion.rnscreens.** { *; }
-dontwarn com.swmansion.rnscreens.**

# ─── React Native Safe Area Context ─────────────────────────────────────────
-keep class com.th3rdwave.safeareacontext.** { *; }
-dontwarn com.th3rdwave.safeareacontext.**

# ─── React Native Image Picker ───────────────────────────────────────────────
-keep class com.imagepicker.** { *; }
-dontwarn com.imagepicker.**

# ─── React Native community packages (clipboard, net-info, etc.) ─────────────
-keep class com.reactnativecommunity.** { *; }
-dontwarn com.reactnativecommunity.**

# ─── Deep link + intent filter Activities ────────────────────────────────────
# Activities launched from an intent filter are instantiated by name from
# AndroidManifest; renaming them breaks deep links (afuchat:// + https://).
-keep public class * extends android.app.Activity { *; }
-keep public class * extends android.content.BroadcastReceiver { *; }
-keep public class * extends android.app.Service { *; }
-keep public class * extends android.content.ContentProvider { *; }

# ─── Background tasks (Expo TaskManager / WorkManager) ───────────────────────
# TaskManager registers workers by class name; renaming breaks all background
# tasks (call service and related background handling).
-keep class androidx.work.** { *; }
-dontwarn androidx.work.**
-keep class expo.modules.taskManager.** { *; }

# ─── React Native WebRTC / media (used in calling feature) ───────────────────
# org.webrtc — the native C++ WebRTC library (libwebrtc)
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
# com.oney.WebRTCModule — the React Native Java bridge for react-native-webrtc.
# R8 strips this package in full-mode because nothing references it from Java
# outside of the RN module registry (which uses reflection). Without this rule
# TurboModuleRegistry.get("WebRTCModule") returns null and all voice calls fail
# with WEBRTC_UNAVAILABLE on every production build.
-keep class com.oney.WebRTCModule.** { *; }
-dontwarn com.oney.WebRTCModule.**

# ─── Suppress library-internal warnings that do not affect runtime ────────────
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.*
-dontwarn com.google.errorprone.annotations.**
-dontwarn sun.misc.Unsafe
