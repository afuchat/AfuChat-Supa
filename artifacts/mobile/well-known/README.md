# Verified Domain Links — Hosting Instructions

These two files must be served from `https://afuchat.com/.well-known/` (and `https://www.afuchat.com/.well-known/`) **before** a new build is installed. Android and iOS fetch them at install time to verify ownership.

---

## 1. `assetlinks.json` → Android App Links

**Deploy to:** `https://afuchat.com/.well-known/assetlinks.json`  
(also at `https://www.afuchat.com/.well-known/assetlinks.json` if www is a separate origin)

**Requirements:**
- Must be served over HTTPS
- Content-Type: `application/json`
- Must be publicly accessible (no auth, no redirects)

**How to get your SHA-256 fingerprint:**

Option A — EAS-managed keystore (most common):
```bash
cd artifacts/mobile
EXPO_TOKEN=<your-token> pnpm exec eas credentials
# Select: Android → production → Keystore → View SHA-256 fingerprint
```

Option B — Google Play Console (if enrolled in Play App Signing):
> Play Console → Your app → Setup → App signing → "App signing key certificate" → SHA-256 certificate fingerprint

Replace `REPLACE_WITH_YOUR_SHA256_FINGERPRINT` in `assetlinks.json` with the colon-separated hex string, e.g.:
```
AB:CD:12:34:...
```

You can include multiple fingerprints (e.g. debug + release) as an array.

---

## 2. `apple-app-site-association` → iOS Universal Links

**Deploy to:** `https://afuchat.com/.well-known/apple-app-site-association`

**Requirements:**
- Must be served over HTTPS
- Content-Type: `application/json`
- No `.json` extension in the filename
- Must be publicly accessible

**How to get your Apple Team ID:**
> Apple Developer Portal → Account → Membership → Team ID (10-character string, e.g. `A1B2C3D4E5`)

Replace `REPLACE_WITH_APPLE_TEAM_ID` in the file with your Team ID, e.g.:
```
A1B2C3D4E5.com.afuchat.mobile
```

---

## 3. Verify it's working

After deploying both files, test with:
```bash
# Android — check Google's verification service
curl "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://afuchat.com&relation=delegate_permission/common.handle_all_urls"

# iOS — check AASA is reachable
curl -I "https://afuchat.com/.well-known/apple-app-site-association"
```

Android also caches App Links verification — on a test device run:
```bash
adb shell pm set-app-links --package com.afuchat.mobile 2 afuchat.com www.afuchat.com
adb shell pm verify-app-links --re-verify com.afuchat.mobile
```

---

## 4. What was changed in the app

- `app.json` → `android.intentFilters`: added a second filter with `autoVerify: true` for `https://afuchat.com/*` and `https://www.afuchat.com/*`
- `app.json` → `ios`: added `bundleIdentifier: "com.afuchat.mobile"` and `associatedDomains: ["applinks:afuchat.com", "applinks:www.afuchat.com"]`

A new EAS build is required for these changes to take effect in the installed app.
