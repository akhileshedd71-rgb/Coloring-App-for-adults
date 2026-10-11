#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/android-env.sh"
cd "$SCRIPT_DIR/.."
npm run build
npx cap sync android
./android/gradlew -p android --no-daemon --max-workers=4 assembleDebug
mkdir -p artifacts
cp android/app/build/outputs/apk/debug/app-debug.apk artifacts/musemallow-debug.apk
"$ANDROID_HOME/build-tools/35.0.0/apksigner" verify --verbose artifacts/musemallow-debug.apk
sha256sum artifacts/musemallow-debug.apk > artifacts/musemallow-debug.apk.sha256
printf 'Installable APK: artifacts/musemallow-debug.apk\n'
