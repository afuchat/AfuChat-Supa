#!/bin/bash
cd "$(dirname "$0")/.."
export EXPO_TOKEN="${EXPO_TOKEN:-${EXPO_ACCESS_TOKEN:-}}"
APK_ID="f6bf701b-9a7e-4e9e-9413-b59cc7c94318"
AAB_ID="e4cdd882-b26f-4046-bf6e-65815cab78c0"
echo "=== Monitoring EAS Android builds (bug fixes + OAuth) ==="
echo "APK (preview):    https://expo.dev/accounts/afuapp/projects/afuchat/builds/$APK_ID"
echo "AAB (production): https://expo.dev/accounts/afuapp/projects/afuchat/builds/$AAB_ID"
watch_build() {
  local ID=$1 LABEL=$2
  while true; do
    RAW=$(EAS_NO_VCS=1 EXPO_TOKEN=$EXPO_TOKEN node_modules/.bin/eas build:view "$ID" --json 2>&1)
    STATUS=$(echo "$RAW" | node -e "const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{ try{ const m=c.join('').match(/\{[\s\S]*\}/); process.stdout.write(JSON.parse(m[0]).status||'UNKNOWN'); }catch(e){ process.stdout.write('IN_PROGRESS'); }})" 2>/dev/null || echo "IN_PROGRESS")
    ARTIFACT=$(echo "$RAW" | node -e "const c=[]; process.stdin.on('data',d=>c.push(d)); process.stdin.on('end',()=>{ try{ const m=c.join('').match(/\{[\s\S]*\}/); const d=JSON.parse(m[0]); process.stdout.write((d.artifacts&&d.artifacts.buildUrl)||'none'); }catch(e){ process.stdout.write('none'); }})" 2>/dev/null || echo "none")
    echo "$(date -u +%H:%M:%S) [$LABEL] status=$STATUS artifact=$ARTIFACT"
    if [ "$STATUS" = "FINISHED" ] || [ "$STATUS" = "ERRORED" ] || [ "$STATUS" = "EXPIRED" ] || [ "$STATUS" = "CANCELLED" ]; then
      echo "=== [$LABEL] FINAL: $STATUS — $ARTIFACT ==="
      break
    fi
    sleep 60
  done
}
watch_build "$APK_ID" "APK" &
watch_build "$AAB_ID" "AAB" &
wait
echo "=== Both builds finished ==="
