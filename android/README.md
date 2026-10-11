# Android wrapper

Musemallow uses Capacitor 7 with a bundled, offline web application. There is no development server URL in the production configuration. The application ID is `studio.musemallow.coloring`; keep it unchanged for updates that preserve users' local galleries.

## Build

The main repository README covers web development. On Linux x64, `bash scripts/setup-android.sh` installs JDK 21, Android SDK platform 35, build tools 34/35, and platform tools under `/workspace/tools`. Set `MUSEMALLOW_TOOLS_DIR` to a writable location for other machines, or supply existing `JAVA_HOME` and `ANDROID_HOME` locations. Downloads retain TLS verification; Android CLI and Gradle distribution checksums are pinned. Existing system Java CA trust and the configured HTTP proxy are used where present.

Run `bash scripts/build-android.sh` from the checkout to rebuild the web assets, synchronize them, assemble the APK, verify its signature, and write `artifacts/musemallow-debug.apk` and its SHA-256 checksum. For direct native commands, source `scripts/android-env.sh`, then use `./android/gradlew -p android <task>`.

The APK is a signed **debug/test build**, not a Play Store release. Android 6 (API 23) or newer and a current Android System WebView are required. Target SDK is 35. Gradle creates a local debug key; retain the same key for install-over updates of this test APK. A store release needs the publisher's own signing key, a versionCode increment, and release validation. No signing secrets are committed.

## Native integration

`StudioFilesPlugin.java` exposes image sharing, app pause, and system back handling. PNG/JPEG exports use a private cache file and `FileProvider` URI with a temporary read grant. Only the `exports/` cache subdirectory can be shared; there are no broad storage or photo permissions. Share files older than 24 hours are cleaned up when another export is created.

The Android back gesture is forwarded to the web application so it can close panels, return to the library, and save work. Only an unconsumed back action closes the activity. Android pause is forwarded so the application can flush its save queue. The JavaScript side also listens for page visibility and pagehide. Capacitor adjusts Android 15 window insets and the app handles responsive phone/tablet layouts.

The launcher and splash use original vector flower assets in `app/src/main/res/drawable/studio_flower.xml`. The build has no advertising, analytics, billing, account, or tracking SDK. Internet permission is inherited from Capacitor's standard WebView host; application content is bundled and no server is required. Android cloud backup is disabled.

## Validation performed and limits

JDK 21 compilation, Gradle assembly, resource packaging, and APK v1/v2 signature verification passed. Android Lint completed with zero errors and eight warnings (platform compatibility, generated resources, backup-rule and themed-icon suggestions). The Linux setup script was rerun successfully. The final APK contains the compiled application, 139 drawings, six colored reference PNGs, fonts, and other local assets; no development server is configured. The merged manifest requests Internet access for the WebView and AndroidX's app-private receiver permission only.

For the original version 1.0 validation, an Android 15/API 35 AOSP x86_64 software emulator was installed and booted without KVM, using SwiftShader. The APK installed successfully and its activity/process and native StudioFiles plugin initialized. Native logs confirmed loading the bundled `https://localhost/` page. The final version 1.0 build also installed successfully over the earlier test build with `adb install -r`. These observations validate installation and native startup, **not** completed interaction tests or saved-painting preservation across an update.

The emulator was unstable: Android's own SystemServer hit a 60-second watchdog timeout during first boot. A retry with one emulated CPU, cached first-boot data, zero system animation scales, and the supported `watchdog_timeout_millis=600000` setting reached `sys.boot_completed=1`. It still displayed **“Process system isn't responding.”** Its WebView 124 renderer subsequently terminated with code 5, and Chromium terminated the host app before a usable page could be attached through DevTools. A generic emulator `-prop ro.hw_timeout_multiplier` option was rejected and had no effect. The unhealthy emulator was stopped after this bounded investigation.

Consequently, native library/canvas interaction, painting restoration after a force-stop or APK update, the PNG/JPEG share chooser, Android back/predictive back, rotation, and native screenshots of the working UI remain **unverified**. Browser tests exercise real painting, gestures, storage, exports, and responsive layouts but do not replace these Android checks. Before release, run them on a healthy emulator or physical phone/tablet, including display cutouts, background interruptions, low-storage errors, stylus pressure, and performance on typical hardware. No physical-device result is claimed.

Version 1.1 adds Portrait Atelier and increments versionCode to 2. Its APK is rebuilt with the retained test signing key. The unhealthy emulator investigation was not repeated for this artwork update; native runtime and install-over preservation on a healthy device remain unverified.

Version 1.2 adds Floral Reverie and its offline reference viewer, with versionCode 3. References are separate local image assets and do not enter painting commands or exports. The update uses the retained test signing key; native reference interaction and install-over data preservation still require a healthy Android device.
