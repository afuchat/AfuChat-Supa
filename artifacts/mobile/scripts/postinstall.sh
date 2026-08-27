#!/usr/bin/env bash
# Patch: react-native-worklets SoLoader try-catch.
# WorkletsModule has a static { SoLoader.loadLibrary("worklets"); } block that runs
# when the class is first loaded (New Architecture, during early JS init). If libworklets.so
# fails to load (ABI mismatch, linker error, missing dep), it throws UnsatisfiedLinkError
# which escapes the Java exception handler and crashes the whole JVM before any JS error
# handler can catch it. Wrapping in try-catch degrades gracefully: Reanimated will
# report a JS error (caught by ErrorBoundary) instead of a silent native crash.

set -e

# ─── Skip patch if python3 is unavailable (e.g. Replit web env) ─────────────
if ! command -v python3 &>/dev/null; then
  echo "[postinstall] python3 not found — skipping WorkletsModule patch (web/dev env)."
  exit 0
fi

# ─── Patch: WorkletsModule SoLoader try-catch ───────────────────────────────
# Patch both bundling variants (experimentalBundling is used by New Architecture builds;
# legacyBundling is compiled by Old Architecture / fallback builds).

patch_worklets() {
  local FILE="$1"
  if [ ! -f "$FILE" ]; then
    return
  fi

  python3 - "$FILE" <<'PYEOF'
import sys
import pathlib

path = pathlib.Path(sys.argv[1])
txt = path.read_text()

OLD = '  static {\n    SoLoader.loadLibrary("worklets");\n  }'
NEW = ('  static {\n'
       '    try {\n'
       '      SoLoader.loadLibrary("worklets");\n'
       '    } catch (Throwable __wt) {\n'
       '      android.util.Log.e("WorkletsModule",\n'
       '          "libworklets.so failed to load — Reanimated will be disabled: " + __wt);\n'
       '    }\n'
       '  }')

if OLD in txt:
    path.write_text(txt.replace(OLD, NEW, 1))
    print("[postinstall] WorkletsModule patched:", path)
else:
    print("[postinstall] WorkletsModule static block not found (already patched or changed):", path)
PYEOF
}

WORKLETS_EXP="node_modules/react-native-worklets/android/src/experimentalBundling/com/swmansion/worklets/WorkletsModule.java"
WORKLETS_LEG="node_modules/react-native-worklets/android/src/legacyBundling/com/swmansion/worklets/WorkletsModule.java"

patch_worklets "$WORKLETS_EXP"
patch_worklets "$WORKLETS_LEG"

# ─── Verify patches applied — fail loudly if not ──────────────────────────────
# Silent patch failure is worse than a build failure: it produces an APK that
# crashes on launch with no JS error, no stack trace, and no red-box.

WORKLETS_PATCHED=0
if grep -q 'catch (Throwable __wt)' "$WORKLETS_EXP" 2>/dev/null; then WORKLETS_PATCHED=1; fi
if grep -q 'catch (Throwable __wt)' "$WORKLETS_LEG" 2>/dev/null; then WORKLETS_PATCHED=1; fi

if [ "$WORKLETS_PATCHED" -eq 0 ]; then
  echo "[postinstall] ERROR: WorkletsModule SoLoader patch DID NOT APPLY." >&2
  echo "[postinstall] The static SoLoader.loadLibrary(\"worklets\") block was not found in either:" >&2
  echo "  $WORKLETS_EXP" >&2
  echo "  $WORKLETS_LEG" >&2
  echo "[postinstall] Without this patch, a libworklets.so load failure crashes the JVM" >&2
  echo "[postinstall] before any JS error handler can intercept it." >&2
  echo "[postinstall] Check that react-native-worklets@0.7.4 is installed and its Java" >&2
  echo "[postinstall] source has not changed the static block format." >&2
  exit 1
fi
echo "[postinstall] WorkletsModule SoLoader patch verified OK."

# ─── Patch: RNTP nullable Bundle arguments for RN 0.83 ───────────────────────
# react-native-track-player 4.1.2 declares Track.originalItem as Bundle?, while
# React Native 0.83 exposes Arguments.fromBundle as accepting Bundle (non-null).
# Kotlin 2.x therefore rejects the upstream source during release compilation.
# Keep the JS-visible behavior stable by converting an absent item to an empty
# Bundle before handing it to React Native.

patch_track_player() {
  local FILE="$1"
  if [ ! -f "$FILE" ]; then
    return
  fi

  python3 - "$FILE" <<'PYEOF'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
txt = path.read_text()

replacements = [
    (
        "Arguments.fromBundle(musicService.tracks[index].originalItem)",
        "Arguments.fromBundle(musicService.tracks[index].originalItem ?: Bundle())",
    ),
    (
        "musicService.tracks.map { it.originalItem }",
        "musicService.tracks.map { it.originalItem ?: Bundle() }",
    ),
    (
        "musicService.tracks[musicService.getCurrentTrackIndex()].originalItem\n"
        "            )",
        "musicService.tracks[musicService.getCurrentTrackIndex()].originalItem ?: Bundle()\n"
        "            )",
    ),
]

changed = False
for old, new in replacements:
    if old in txt:
        txt = txt.replace(old, new, 1)
        changed = True

if changed:
    path.write_text(txt)
    print("[postinstall] RNTP nullable Bundle patch applied:", path)
else:
    print("[postinstall] RNTP nullable Bundle patch already applied or source changed:", path)
PYEOF
}

TRACK_PLAYER_FILE="node_modules/react-native-track-player/android/src/main/java/com/doublesymmetry/trackplayer/module/MusicModule.kt"
patch_track_player "$TRACK_PLAYER_FILE"

if [ -f "$TRACK_PLAYER_FILE" ] && ! rg -q \
  'originalItem \?: Bundle\(\)' "$TRACK_PLAYER_FILE"; then
  echo "[postinstall] ERROR: RNTP nullable Bundle patch DID NOT APPLY." >&2
  echo "  $TRACK_PLAYER_FILE" >&2
  exit 1
fi
echo "[postinstall] RNTP nullable Bundle patch verified OK."
