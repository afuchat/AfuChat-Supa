/**
 * Keeps the generated Android project on the optimized release toolchain.
 *
 * Expo uses Continuous Native Generation, so this must be a config plugin
 * instead of an edit to the generated android/ directory.
 */
const {
  withProjectBuildGradle,
  withSettingsGradle,
  withGradleProperties,
  withAppBuildGradle,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const AGP_VERSION = "9.0.0";
// AGP 9.0.0 requires Gradle 9.1.0 or newer.
// "9.1" is not a published distribution name; Gradle 9.1 is published as 9.1.0.
const GRADLE_VERSION = "9.1.0";
const AGP_MARKER = "// AfuChat Android Gradle Plugin 9 optimization";

function updateAgpDeclaration(contents) {
  if (contents.includes(AGP_MARKER)) return contents;

  let updated = contents;
  let changed = false;

  updated = updated.replace(
    /(com\.android\.tools\.build:gradle:)[\w.+-]+/g,
    `$1${AGP_VERSION}`,
  );
  changed ||= updated !== contents;

  updated = updated.replace(
    /(id\(["']com\.android\.(?:application|library)["']\)\s+version\s+["'])[^"']+(["'])/g,
    `$1${AGP_VERSION}$2`,
  );
  changed ||= updated !== contents;

  // Some Expo templates keep the version in pluginManagement and use a
  // versionless buildscript coordinate in the project build file.
  if (!changed && /com\.android\.tools\.build:gradle['"]/.test(updated)) {
    updated = updated.replace(
      /com\.android\.tools\.build:gradle(?=['"])/,
      `com.android.tools.build:gradle:${AGP_VERSION}`,
    );
    changed = updated !== contents;
  }

  if (!changed) return contents;
  return `${AGP_MARKER}\n${updated}`;
}

function withAgp(config) {
  config = withProjectBuildGradle(config, (config) => {
    config.modResults.contents = updateAgpDeclaration(config.modResults.contents);
    return config;
  });
  return withSettingsGradle(config, (config) => {
    config.modResults.contents = updateAgpDeclaration(config.modResults.contents);
    return config;
  });
}

function withGradleWrapper(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const wrapperPath = path.join(
        config.modRequest.platformProjectRoot,
        "gradle",
        "wrapper",
        "gradle-wrapper.properties",
      );
      if (!fs.existsSync(wrapperPath)) return config;

      const contents = fs.readFileSync(wrapperPath, "utf8");
      const updated = contents.replace(
        /distributionUrl=.*gradle-[\d.]+-(?:bin|all)\.zip/,
        `distributionUrl=https\\://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip`,
      );
      if (updated !== contents) fs.writeFileSync(wrapperPath, updated);
      return config;
    },
  ]);
}

/**
 * expo-build-properties normally writes these values into the generated
 * release build type. Keep the Gradle properties explicit as a fallback:
 * Expo templates have changed the generated build.gradle shape across SDK
 * releases, while these properties remain stable and are consumed by the
 * React Native/Expo release template.
 */
function withReleaseOptimizations(config) {
  return withGradleProperties(config, (config) => {
    const properties = config.modResults;
    const ensureProperty = (key, value) => {
      const existing = properties.find(
        (property) => property.type === "property" && property.key === key,
      );
      if (existing) {
        existing.value = value;
      } else {
        properties.push({ type: "property", key, value });
      }
    };

    ensureProperty("android.enableMinifyInReleaseBuilds", "true");
    ensureProperty("android.enableShrinkResourcesInReleaseBuilds", "true");
    return config;
  });
}

/**
 * AGP 9 rejects the legacy proguard-android.txt template because it contains
 * -dontoptimize. Expo's release template still emits that filename when R8
 * minification is enabled, so normalize it after expo-build-properties has
 * generated the app build file. This runs on every CNG/EAS prebuild.
 */
function withOptimizedProguardTemplate(config) {
  return withAppBuildGradle(config, (config) => {
    const contents = config.modResults.contents;
    const updated = contents.replace(
      /getDefaultProguardFile\(\s*(['"])proguard-android\.txt\1\s*\)/g,
      "getDefaultProguardFile('proguard-android-optimize.txt')",
    );

    if (updated !== contents) {
      console.log(
        "[withAndroidBuildOptimization] Replaced legacy proguard-android.txt with proguard-android-optimize.txt",
      );
      config.modResults.contents = updated;
    }

    if (/getDefaultProguardFile\(\s*(['"])proguard-android\.txt\1\s*\)/.test(
      config.modResults.contents,
    )) {
      throw new Error(
        "[withAndroidBuildOptimization] Legacy proguard-android.txt reference remains in android/app/build.gradle.",
      );
    }

    return config;
  });
}

module.exports = (config) =>
  withOptimizedProguardTemplate(
    withReleaseOptimizations(withGradleWrapper(withAgp(config))),
  );