# Validation

The automated browser suite runs against actual Canvas and IndexedDB implementations in Chromium. Tests live under `tests/`; run `npm test`. Test results and traces are local build output, not committed.

## Scope

- Painting tests inspect rendered/exported pixels for fill, clipping, shading, erasing, gradients, undo/redo, and deterministic replay.
- Input tests exercise transformed pointer positions, two-finger navigation, tentative-stroke cancellation, and pressure input.
- Storage tests close/reopen the page, verify editable commands and original geometry, preserve latest queued writes, exercise duplicate/rename/favorite/delete, and prove gallery summaries do not replace saved stroke history.
- Artwork tests validate catalog size, IDs, distinct geometry, region structure, and difficulty information.
- UI checks cover library controls, editing, autosave/reopen, themes, export, and phone/tablet/landscape geometry.

## Android device limitations

This cloud machine has no attached physical Android device and no `/dev/kvm` for a hardware-accelerated emulator. A software-emulated AOSP Android 15 (API 35) device was provisioned for additional native checks; its outcome is recorded below. Physical stylus pressure, palm rejection, vendor WebView behavior, and typical-phone memory/performance still require a physical-device pass. Browser pointer tests do not establish those hardware behaviors.

Before a production release, install on at least one typical phone and one tablet, paint for an extended session, share PNG/JPEG into another app, rotate while painting, background/force-stop/reopen after autosave completes, verify system back, and test a supported stylus. Development builds use a debug signing certificate; use a retained release signing key for public distribution.

## Data handling

Drawings and settings are stored on-device. Confirmed gallery deletion and reset are intentional destructive actions; erasing, undo/redo, and duplicated work are independent. Exported images are put into Android’s private cache and shared with temporary read permission through FileProvider; no broad storage permission is needed. Export-cache files older than 24 hours are cleaned when sharing again. Clearing app storage or uninstalling removes local work.

## Validation record

Validated on 2026-10-11:

| Check | Result |
| --- | --- |
| Frozen dependency install (`npm ci`) | Passed |
| TypeScript and production web build (`npm run build`) | Passed |
| Full browser suite (`npm test`) | **30 passed**, 0 failed, 0 skipped |
| Artwork validation | 4 tests; all 121 drawings and thumbnails; every advertised region reachable |
| Canvas behavior | 13 tests; real pixel/input/export assertions |
| Local storage | 5 tests; persistence, exact commands, queued writes, metadata isolation |
| Integrated UI | 8 tests; gallery, autosave/reopen, controls, exports, errors, responsive layouts |
| Native Android build | Gradle `assembleDebug` passed |
| Android lint | 0 errors; dependency/toolchain warnings documented by build output |
| APK signature | v1 and v2 signatures verified by `apksigner` |
| APK contents | All 121 drawings bundled; every file in current production `dist/` matches packaged assets byte-for-byte |
| Android 15 software emulator installation | Initial install and final APK install-over (`adb install -r`) passed |
| Native runtime interaction | Unverified: emulator SystemServer ANRs and WebView renderer termination prevented a usable app session |

The software emulator reached boot completion and initialized the activity and native StudioFiles plugin, then requested the bundled application page. Android displayed “Process system isn't responding”; WebView 124 subsequently terminated its renderer with code 5 and closed the host app. Native painting, force-stop restoration, saved-data preservation across updates, share-sheet behavior, system back, rotation, and physical-device performance remain unverified. Successful install-over alone does not establish saved-data preservation. See [the Android validation notes](../android/README.md#validation-performed-and-limits) for the investigation details.

Actual browser screenshots are under `docs/screenshots/`; reproduce them with `node scripts/capture-screenshots.mjs` while Vite is running. Browser layout checks exercised 360×800, 412×915, 800×1280, 1280×800, and 844×390 viewports. Stylus and multi-touch tests dispatch actual browser input events; physical hardware was not used.

The initial test failures identified invalid XML ampersands in SVG titles, inaccessible hidden construction regions, and occluded outlines. Those were fixed and the complete suite was rerun successfully. Two integrated-test selectors were also corrected to target visible mobile navigation rather than the hidden desktop navigation.
