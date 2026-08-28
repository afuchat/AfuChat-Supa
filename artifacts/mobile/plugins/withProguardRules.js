/**
 * withProguardRules.js — Expo config plugin
 *
 * What it does
 * ────────────
 * 1. Appends AfuChat's custom R8/ProGuard rules to the generated
 *    android/app/proguard-rules.pro file (idempotent — safe to run multiple
 *    times via `expo prebuild --clean`).
 *
 * 2. Injects a Gradle snippet into android/app/build.gradle that copies the
 *    R8 mapping file to a version-stamped filename after every release build:
 *
 *      android/app/build/outputs/mapping/release/mapping-<version>-<versionCode>.txt
 *      android/app/build/archives/r8/mapping-<version>-<versionCode>.txt
 *
 *    This makes it easy to archive and upload to Google Play Console.
 *
 * Why a plugin instead of a static file
 * ──────────────────────────────────────
 * AfuChat uses Expo CNG (Continuous Native Generation): the android/ folder
 * is generated fresh on every `expo prebuild` / EAS build and is intentionally
 * gitignored.  A static android/app/proguard-rules.pro would be wiped on each
 * prebuild.  This plugin re-applies the rules every time prebuild runs.
 *
 * Registration
 * ────────────
 * Add to app.json plugins array:
 *   "./plugins/withProguardRules"
 */

const { withDangerousMod, withAppBuildGradle } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const RULES_MARKER =
  "# >>> AfuChat custom R8 rules — injected by withProguardRules plugin <<<";

const GRADLE_MARKER =
  "// >>> AfuChat: R8 mapping-file copy task (withProguardRules) <<<";

// ─── Step 1: Append custom rules to android/app/proguard-rules.pro ──────────

function applyProguardRules(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const platformRoot = config.modRequest.platformProjectRoot;

      const customRulesPath = path.join(projectRoot, "proguard-rules.pro");
      const targetPath = path.join(platformRoot, "app", "proguard-rules.pro");

      if (!fs.existsSync(customRulesPath)) {
        console.warn(
          "[withProguardRules] proguard-rules.pro not found at " +
            customRulesPath +
            " — skipping rule injection."
        );
        return config;
      }

      const customRules = fs.readFileSync(customRulesPath, "utf8");

      let existing = "";
      if (fs.existsSync(targetPath)) {
        existing = fs.readFileSync(targetPath, "utf8");
      }

      // Idempotent: only inject once
      if (existing.includes(RULES_MARKER)) {
        return config;
      }

      const separator = existing.endsWith("\n") ? "" : "\n";
      fs.writeFileSync(
        targetPath,
        existing + separator + "\n" + RULES_MARKER + "\n" + customRules + "\n"
      );

      console.log(
        "[withProguardRules] Custom R8 rules appended to " + targetPath
      );
      return config;
    },
  ]);
}

// ─── Step 2: Add a Gradle task that copies mapping.txt with version stamp ────

const MAPPING_TASK = `
${GRADLE_MARKER}
// After R8 runs, copy mapping.txt to a version-stamped filename so every
// release build produces a uniquely named artefact ready to upload to
// Google Play Console (Manage releases → App bundle explorer → Downloads).
tasks.configureEach { task ->
    if (task.name == "minifyReleaseWithR8") {
        task.doLast {
            def versionName = android.defaultConfig.versionName ?: "unknown"
            def versionCode = android.defaultConfig.versionCode ?: 0
            def mappingDir  = new File("\${buildDir}/outputs/mapping/release")
            def src = new File(mappingDir, "mapping.txt")
            def dst = new File(mappingDir, "mapping-\${versionName}-\${versionCode}.txt")
            def archiveDir = new File("\${buildDir}/archives/r8")
            def archive = new File(archiveDir, "mapping-\${versionName}-\${versionCode}.txt")
            if (src.exists()) {
                archiveDir.mkdirs()
                dst.bytes = src.bytes
                archive.bytes = src.bytes
                println ""
                println "==========================================================="
                println " R8 mapping archived:"
                println "   " + dst.absolutePath
                println "   " + archive.absolutePath
                println " Upload this file to Google Play Console for deobfuscation."
                println "==========================================================="
                println ""
            }
        }
    }
}
`;

function applyMappingTask(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes(GRADLE_MARKER)) {
      return config;
    }
    config.modResults.contents += MAPPING_TASK;
    return config;
  });
}

// ─── Plugin entry point ───────────────────────────────────────────────────────

const withProguardRules = (config) => {
  config = applyProguardRules(config);
  config = applyMappingTask(config);
  return config;
};

module.exports = withProguardRules;
