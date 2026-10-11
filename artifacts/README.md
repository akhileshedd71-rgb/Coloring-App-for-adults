# Android test build

- [Download Musemallow APK](musemallow-debug.apk)
- [SHA-256 checksum](musemallow-debug.apk.sha256)

This is a signed, installable debug build of `studio.musemallow.coloring`, version 1.2 (versionCode 3), for Android 6 (API 23) and newer with an updated Android System WebView. It contains 139 offline drawings, six matching colored floral references, fonts, the painting engine, and local gallery. It requires no account or purchase.

Download the APK on your Android device and open it. Android may ask you to allow installation from the app used to open the file. Keep the app installed to retain saved artwork; updating with the same signing key preserves its local data.

To install with Android platform tools:

```sh
adb install -r artifacts/musemallow-debug.apk
```

To verify the download from the repository root:

```sh
sha256sum -c artifacts/musemallow-debug.apk.sha256
```

Regenerate with `npm run android:build`. See [validation notes](../docs/TESTING.md) for tested behavior and physical-device limitations. Production distribution needs a retained release signing key and its own release validation.
