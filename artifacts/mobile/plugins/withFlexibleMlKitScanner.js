/**
 * ML Kit's bundled barcode-scanner delegate declares portrait-only orientation.
 * Android 16 will ignore that restriction on large screens, so remove it from
 * the generated manifest while leaving the host activity unrestricted.
 */
const { withAndroidManifest } = require("@expo/config-plugins");

const SCANNER_ACTIVITY =
  "com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity";

module.exports = function withFlexibleMlKitScanner(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;

    // Keep the host application unrestricted for large screens. The
    // resizeableActivity config is intentionally omitted from app.json, but
    // remove a stale value if another config plugin added it.
    if (application.$?.["android:resizeableActivity"]) {
      delete application.$["android:resizeableActivity"];
      application.$["tools:remove"] = "android:resizeableActivity";
    }

    const activities = application.activity ?? (application.activity = []);
    const scanner = activities.find(
      (activity) => activity.$?.["android:name"] === SCANNER_ACTIVITY,
    );

    if (scanner) {
      delete scanner.$["android:screenOrientation"];
      scanner.$["tools:remove"] = "android:screenOrientation";
    } else {
      // The activity is contributed by the ML Kit dependency after Expo's
      // manifest pass. This declaration lets Android's manifest merger remove
      // only the dependency's portrait attribute while keeping the activity.
      activities.push({
        $: {
          "android:name": SCANNER_ACTIVITY,
          "tools:remove": "android:screenOrientation",
        },
      });
    }

    return config;
  });
};