/**
 * Keeps the generated Android project on the optimized release toolchain.
 *
 * Expo uses Continuous Native Generation, so this must be a config plugin
 * instead of an edit to the generated android/ directory.
 */
const {
  withProjectBuildGradle,
  withSettingsGradle,
  withDangerousMod,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const AGP_VERSION = "9.0.0";
const GRADLE_VERSION = "9.1";
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

module.exports = (config) => withGradleWrapper(withAgp(config));