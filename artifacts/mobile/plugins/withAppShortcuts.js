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
  config = withIosShortcutRouting(config);
  return config;
};