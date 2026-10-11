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

Latest update validated on 2026-10-12; initial setup and version 1.0 device observations are retained below:

| Check | Result |
| --- | --- |
| Frozen dependency install (`npm ci`) | Passed during initial setup; dependency versions unchanged |
| TypeScript and production web build (`npm run build`) | Passed |
| Full browser suite (`npm test`) | **42 passed**, 0 failed, 0 skipped |
| Artwork validation | 4 tests; all 139 drawings and thumbnails; every advertised region reachable |
| Canvas behavior | 13 tests; real pixel/input/export assertions |
| Local storage | 5 tests; persistence, exact commands, queued writes, metadata isolation |
| Integrated UI | 8 tests; gallery, autosave/reopen, controls, exports, errors, responsive layouts |
| Portrait Atelier regression | 4 tests; original-library preservation, generated region clipping, autosave/reopening, and manually reviewed skin/hair/lip boundaries across all 12 new pages |
| Floral Reverie regression | 3 tests; original 133 drawings preserved, six PNG pairs, actual painting/clipping, and reviewed cross-material boundaries |
| Colored reference viewer | 5 tests; matched lazy images, pinning, painting/persistence, failures, focus/back handling, and responsive layouts |
| Native Android build | Gradle `assembleDebug` passed |
| Android lint | 0 errors, 8 warnings; dependency/toolchain warnings documented by build output |
| APK signature | v1 and v2 signatures verified by `apksigner` |
| APK contents | All 139 drawings and six colored PNG references bundled; all 433 production `dist/` files match packaged assets byte-for-byte |
| Android 15 software emulator installation (version 1.0) | Initial install and final APK install-over (`adb install -r`) passed |
| Version 1.2 update identity | Same application ID and signing certificate as version 1.1; versionCode increased to 3 |
| Native runtime interaction | Unverified: emulator SystemServer ANRs and WebView renderer termination prevented a usable app session |

During the original version 1.0 validation, the software emulator reached boot completion and initialized the activity and native StudioFiles plugin, then requested the bundled application page. Android displayed “Process system isn't responding”; WebView 124 subsequently terminated its renderer with code 5 and closed the host app. Native painting, force-stop restoration, saved-data preservation across updates, share-sheet behavior, system back, rotation, and physical-device performance remain unverified. Successful install-over alone does not establish saved-data preservation. See [the Android validation notes](../android/README.md#validation-performed-and-limits) for the investigation details.

Actual browser screenshots are under `docs/screenshots/`; reproduce them with `node scripts/capture-screenshots.mjs` while Vite is running. Browser layout checks exercised 360×800, 412×915, 800×1280, 1280×800, and 844×390 viewports. Stylus and multi-touch tests dispatch actual browser input events; physical hardware was not used.

The initial test failures identified invalid XML ampersands in SVG titles, inaccessible hidden construction regions, and occluded outlines. Those were fixed and the complete suite was rerun successfully. Two integrated-test selectors were also corrected to target visible mobile navigation rather than the hidden desktop navigation.

## Portrait Atelier update

The new collection adds 12 distinct image-generated sources and sharp editable vector pages. Regression checks preserve the exact metadata and all geometry/preview bytes of the original 121 drawings. Dedicated tests cover the most detailed generated portrait’s real fill, locked shading, gradients and undo/redo, plus filtering, autosave, and pixel-identical reopening.

Visual face-fill review identified tiny source hairline and lip gaps that ordinary mask-isolation tests could not detect. Short author-reviewed vector boundary guides now close those connections in the coloring-region model, while preserving the generated source PNG and fine ink. Sunday Spectacles also received an image-generation hairline repair. Fixed manual source-coordinate probes check face/cheek separation from multiple actual hair areas, lip regions where present, garments, and background; the pre-repair geometry failed this regression.

The version 1.1 APK is rebuilt and signed using the same retained test key. Its native runtime was not retested on the previously unhealthy emulator. Browser performance observations do not establish frame rates on Android phones, especially while zooming the most detailed pages. A physical phone/tablet pass remains necessary.

## Floral Reverie and reference viewer

Version 1.2 adds six original floral line-art PNGs and six matching colored PNGs, compiled into six editable drawings. The regression suite preserves the exact metadata and geometry/preview bytes of all 133 previously released drawings. Source checks validate PNG dimensions, original generation/edit prompts, distinct imagery, monochrome line sources, meaningful colored examples, and byte-identical bundled reference copies.

Manual fill review covers skin, hair, lips, petals, leaves, garments, and exterior white areas. It identified tapered hairline/lip gaps and a garment-to-background connection that simple region-isolation tests would miss. Reviewed local vector guides close those boundaries; the source PNGs remain unchanged. Fixed source-hash-bound probes include the problem locations, with multiple background probes where exterior areas are disconnected. Actual Canvas pixel tests exercise fill, clipped airbrush, gradients, and undo/redo on the most detailed new page.

Five reference-viewer tests cover all six matching local images, on-demand loading, modal focus and keyboard closure, unchanged painting pixels while pinning, no painting through the reference panel, painting/undo/redo/autosave/reopening, missing-image retries, canceled late loads, and phone/tablet/landscape bounds in dark and reduced-motion modes. A mocked native adapter checks the application's back-callback ordering; it does not establish delivery of physical Android back events.

All pairs were visually compared for adult anatomy and matching composition. The reference sheet and pinned panel are separate from painting layers and saved commands. Browser screenshots include real saved coloring with a reference visible. Version 1.2 retains the application ID and test signing key and increments versionCode to 3. Physical Android reference interaction, memory/performance, and saved-work preservation across an installed update remain unverified on this cloud machine.
