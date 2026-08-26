/**
 * Adds AfuChat's launcher shortcuts to native builds.
 *
 * Android reads static shortcuts from res/xml and shows them when the user
 * long-presses the AfuChat icon. iOS shortcut definitions live in app.json;
 * this plugin forwards their URL payload through Expo's normal URL delegate.
 *
 * Expo Go cannot install launcher shortcuts because it does not contain the
 * generated native resources. A preview or production build is required.
 */

const {
  withAndroidManifest,
  withDangerousMod,
  withAppDelegate,
  withMainApplication,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const SHORTCUTS_RESOURCE = "afuchat_shortcuts";
const MANIFEST_META_NAME = "android.app.shortcuts";
const ANDROID_MARKER = "AfuChat launcher shortcuts";
const IOS_MARKER = "// AfuChat launcher shortcut URL forwarding";
const IOS_LAUNCH_MARKER = "// AfuChat launcher shortcut cold-start forwarding";

const SHORTCUTS_XML = `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <shortcut
        android:shortcutId="new-chat"
        android:enabled="true"
        android:icon="@mipmap/ic_launcher"
        android:shortcutShortLabel="@string/shortcut_new_chat"
        android:shortcutLongLabel="@string/shortcut_new_chat_long">
        <intent
            android:action="android.intent.action.VIEW"
            android:targetPackage="com.afuchat.mobile"
            android:targetClass="com.afuchat.mobile.MainActivity"
            android:data="afuchat://new-chat" />
    </shortcut>
    <shortcut
        android:shortcutId="create-post"
        android:enabled="true"
        android:icon="@mipmap/ic_launcher"
        android:shortcutShortLabel="@string/shortcut_create_post"
        android:shortcutLongLabel="@string/shortcut_create_post_long">
        <intent
            android:action="android.intent.action.VIEW"
            android:targetPackage="com.afuchat.mobile"
            android:targetClass="com.afuchat.mobile.MainActivity"
            android:data="afuchat://create-post" />
    </shortcut>
    <shortcut
        android:shortcutId="search"
        android:enabled="true"
        android:icon="@mipmap/ic_launcher"
        android:shortcutShortLabel="@string/shortcut_search"
        android:shortcutLongLabel="@string/shortcut_search_long">
        <intent
            android:action="android.intent.action.VIEW"
            android:targetPackage="com.afuchat.mobile"
            android:targetClass="com.afuchat.mobile.MainActivity"
            android:data="afuchat://search" />
    </shortcut>
    <shortcut
        android:shortcutId="discover"
        android:enabled="true"
        android:icon="@mipmap/ic_launcher"
        android:shortcutShortLabel="@string/shortcut_discover"
        android:shortcutLongLabel="@string/shortcut_discover_long">
        <intent
            android:action="android.intent.action.VIEW"
            android:targetPackage="com.afuchat.mobile"
            android:targetClass="com.afuchat.mobile.MainActivity"
            android:data="afuchat://discover" />
    </shortcut>
    <!-- Dynamic conversation shortcuts are also eligible for Android Direct Share. -->
    <share-target android:targetClass="com.afuchat.mobile.MainActivity">
        <intent-filter>
            <action android:name="android.intent.action.SEND" />
            <category android:name="android.intent.category.DEFAULT" />
            <data android:mimeType="text/*" />
            <data android:mimeType="image/*" />
            <data android:mimeType="video/*" />
            <data android:mimeType="audio/*" />
            <data android:mimeType="application/*" />
        </intent-filter>
        <category android:name="android.shortcut.conversation" />
    </share-target>
</shortcuts>
`;

const SHORTCUT_STRINGS = `    <!-- ${ANDROID_MARKER} -->
    <string name="shortcut_new_chat">New chat</string>
    <string name="shortcut_new_chat_long">Start a new conversation</string>
    <string name="shortcut_create_post">Create post</string>
    <string name="shortcut_create_post_long">Share something new</string>
    <string name="shortcut_search">Search</string>
    <string name="shortcut_search_long">Search AfuChat</string>
    <string name="shortcut_discover">Discover</string>
    <string name="shortcut_discover_long">Explore AfuChat</string>
`;

function withShortcutManifest(config) {
  return withAndroidManifest(config, (manifestConfig) => {
    const application = manifestConfig.modResults.manifest.application?.[0];
    if (!application) return manifestConfig;

    const metadata = application["meta-data"] ?? (application["meta-data"] = []);
    const existing = metadata.find(
      (item) => item.$?.["android:name"] === MANIFEST_META_NAME,
    );
    const shortcutMetadata = existing ?? { $: { "android:name": MANIFEST_META_NAME } };
    shortcutMetadata.$ = {
      ...shortcutMetadata.$,
      "android:resource": `@xml/${SHORTCUTS_RESOURCE}`,
    };
    if (!existing) metadata.push(shortcutMetadata);

    return manifestConfig;
  });
}

function withShortcutResources(config) {
  return withDangerousMod(config, [
    "android",
    (modConfig) => {
      const resDir = path.join(
        modConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
      );
      const xmlDir = path.join(resDir, "xml");
      const valuesDir = path.join(resDir, "values");
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.mkdirSync(valuesDir, { recursive: true });

      fs.writeFileSync(
        path.join(xmlDir, `${SHORTCUTS_RESOURCE}.xml`),
        SHORTCUTS_XML,
      );

      const stringsPath = path.join(valuesDir, "strings.xml");
      let strings = fs.existsSync(stringsPath)
        ? fs.readFileSync(stringsPath, "utf8")
        : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
      if (!strings.includes(ANDROID_MARKER)) {
        strings = strings.replace("</resources>", `${SHORTCUT_STRINGS}</resources>`);
        fs.writeFileSync(stringsPath, strings);
      }

      return modConfig;
    },
  ]);
}

function withNativeShareShortcuts(config) {
  return withDangerousMod(config, [
    "android",
    (modConfig) => {
      const platformRoot = modConfig.modRequest.platformProjectRoot;
      const packageDir = path.join(
        platformRoot,
        "app",
        "src",
        "main",
        "java",
        "com",
        "afuchat",
        "mobile",
      );
      fs.mkdirSync(packageDir, { recursive: true });

      fs.writeFileSync(
        path.join(packageDir, "AfuChatShareShortcutsModule.kt"),
        `package com.afuchat.mobile

import android.content.Context
import android.content.Intent
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.net.URL

class AfuChatShareShortcutsModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val avatarCache = mutableMapOf<String, Bitmap>()

  private data class ChatShortcut(
    val chatId: String,
    val label: String,
    val avatarUrl: String?,
  )

  override fun getName(): String = "AfuChatShareShortcuts"

  @ReactMethod
  fun update(recipients: ReadableArray, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N_MR1) {
      promise.resolve(false)
      return
    }

    val chats = mutableListOf<ChatShortcut>()
    for (index in 0 until recipients.size()) {
      val item = recipients.getMap(index) ?: continue
      val chatId = if (item.hasKey("chatId") && !item.isNull("chatId")) item.getString("chatId") else null
      val label = if (item.hasKey("label") && !item.isNull("label")) item.getString("label") else null
      val avatarUrl = if (item.hasKey("avatarUrl") && !item.isNull("avatarUrl")) item.getString("avatarUrl") else null
      if (!chatId.isNullOrBlank() && !label.isNullOrBlank()) {
        chats.add(ChatShortcut(chatId, label, avatarUrl))
      }
      if (chats.size >= 8) break
    }

    val context = reactContext.applicationContext
    Thread {
      try {
        val manager = context.getSystemService(Context.SHORTCUT_SERVICE) as? ShortcutManager
        if (manager == null) {
          promise.resolve(false)
          return@Thread
        }

        val shortcuts = chats.map { chat ->
          val icon = loadAvatarIcon(chat.avatarUrl)
            ?: Icon.createWithResource(context, context.applicationInfo.icon)
          val shareIntent = Intent(Intent.ACTION_SEND).apply {
            type = "*/*"
            data = Uri.parse("afuchat://share-chat?chatId=" + Uri.encode(chat.chatId))
          }
          ShortcutInfo.Builder(context, "share-chat-" + chat.chatId)
            .setShortLabel(chat.label.take(25))
            .setLongLabel(("Send to " + chat.label).take(80))
            .setIcon(icon)
            .setIntent(shareIntent)
            .setCategories(setOf("android.shortcut.conversation"))
            .build()
        }
        manager.setDynamicShortcuts(shortcuts)
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("SHARE_SHORTCUTS_UPDATE_FAILED", error)
      }
    }.start()
  }

  private fun loadAvatarIcon(avatarUrl: String?): Icon? {
    if (avatarUrl.isNullOrBlank()) return null
    synchronized(avatarCache) {
      avatarCache[avatarUrl]?.let { return Icon.createWithBitmap(it) }
    }
    return try {
      val connection = URL(avatarUrl).openConnection()
      connection.connectTimeout = 4000
      connection.readTimeout = 4000
      connection.getInputStream().use { stream ->
        val bitmap = BitmapFactory.decodeStream(stream) ?: return null
        synchronized(avatarCache) {
          avatarCache[avatarUrl] = bitmap
        }
        Icon.createWithBitmap(bitmap)
      }
    } catch (_: Exception) {
      null
    }
  }
}
`,
      );

      fs.writeFileSync(
        path.join(packageDir, "AfuChatShareShortcutsPackage.kt"),
        `package com.afuchat.mobile

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class AfuChatShareShortcutsPackage : ReactPackage {
  override fun createNativeModules(
    reactContext: ReactApplicationContext,
  ): List<NativeModule> = listOf(AfuChatShareShortcutsModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
`,
      );

      return modConfig;
    },
  ]);
}

function withNativePackageRegistration(config) {
  return withMainApplication(config, (applicationConfig) => {
    let contents = applicationConfig.modResults.contents;
    const importLine = "import com.afuchat.mobile.AfuChatShareShortcutsPackage";
    const moduleMarker = "add(AfuChatShareShortcutsPackage())";

    if (!contents.includes(importLine)) {
      const configurationImport = "import android.content.res.Configuration";
      if (contents.includes(configurationImport)) {
        contents = contents.replace(
          configurationImport,
          `${configurationImport}\n\n${importLine}`,
        );
      } else {
        contents = contents.replace(
          /^(package [^\n]+)$/m,
          `$1\n\n${importLine}`,
        );
      }
    }

    if (!contents.includes(moduleMarker)) {
      const existingManualPackage = "add(AfuChatDataSyncPackage())";
      if (contents.includes(existingManualPackage)) {
        contents = contents.replace(
          existingManualPackage,
          `${existingManualPackage}\n          ${moduleMarker}`,
        );
      } else {
        contents = contents.replace(
          /(\s*\/\/ Packages that cannot be autolinked yet can be added manually here, for example:)/,
          `\n          ${moduleMarker}$1`,
        );
      }
    }

    applicationConfig.modResults.contents = contents;
    return applicationConfig;
  });
}

function withIosShortcutRouting(config) {
  return withAppDelegate(config, (delegateConfig) => {
    let contents = delegateConfig.modResults.contents;

    if (!contents.includes("import UIKit")) {
      contents = `import UIKit\n${contents}`;
    }

    if (!contents.includes(IOS_LAUNCH_MARKER)) {
      const coldStartForwarder = `

    ${IOS_LAUNCH_MARKER}
    if let shortcutItem = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem,
       let urlString = shortcutItem.userInfo?["url"] as? String,
       let url = URL(string: urlString) {
      DispatchQueue.main.async {
        application.open(url, options: [:], completionHandler: nil)
      }
    }
`;
      const launchAnchor =
        "return super.application(application, didFinishLaunchingWithOptions: launchOptions)";
      if (contents.includes(launchAnchor)) {
        contents = contents.replace(
          launchAnchor,
          `${coldStartForwarder}\n    ${launchAnchor}`,
        );
      }
    }

    if (contents.includes(IOS_MARKER)) {
      delegateConfig.modResults.contents = contents;
      return delegateConfig;
    }

    const shortcutHandler = `

  ${IOS_MARKER}
  override func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    if let urlString = shortcutItem.userInfo?["url"] as? String,
       let url = URL(string: urlString) {
      let handled = super.application(application, open: url, options: [:])
      completionHandler(handled)
      return
    }
    super.application(
      application,
      performActionFor: shortcutItem,
      completionHandler: completionHandler
    )
  }
`;
    const closingBrace = contents.lastIndexOf("\n}");
    delegateConfig.modResults.contents =
      closingBrace >= 0
        ? `${contents.slice(0, closingBrace)}${shortcutHandler}${contents.slice(closingBrace)}`
        : `${contents}${shortcutHandler}`;
    return delegateConfig;
  });
}

module.exports = function withAppShortcuts(config) {
  config = withShortcutManifest(config);
  config = withShortcutResources(config);
  config = withNativeShareShortcuts(config);
  config = withNativePackageRegistration(config);
  config = withIosShortcutRouting(config);
  return config;
};