const fs = require("fs");
const path = require("path");

const appJsonPath = path.resolve(__dirname, "../app.json");
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));

const oldVersion = appJson.expo.version;
const parts = oldVersion.split(".").map(Number);

parts[parts.length - 1] += 1;

const newVersion = parts.join(".");
appJson.expo.version = newVersion;

// Keep versionCode strictly increasing even when the version name contains
// a two-digit patch number (2.2.14 should not reuse 2214).
const currentVersionCode = Number(appJson.expo.android?.versionCode ?? 0);
const versionCode = Math.max(parseInt(parts.join(""), 10), currentVersionCode + 1);
if (!appJson.expo.android) appJson.expo.android = {};
appJson.expo.android.versionCode = versionCode;

if (!appJson.expo.ios) appJson.expo.ios = {};
appJson.expo.ios.buildNumber = newVersion;

fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + "\n");

console.log(`Version bumped: ${oldVersion} → ${newVersion} (versionCode: ${versionCode})`);
