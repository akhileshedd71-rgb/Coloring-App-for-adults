# Generated portrait source compilation

`scripts/compile-portrait-collection.py` turns original generated PNG coloring pages into the same editable vector format used by the painting engine. Original images stay unchanged. The application bundles only compiled artwork; it does not require Python, image generation, network access, or a runtime flood fill.

Use the image-generation tool to create or revise source illustrations. A good source has adult proportions, intentional facial features, clean black ink on white, closed hair and clothing shapes, and very little gray shading. Review the original at full size before compilation. An unsuitable source should be revised through image generation rather than disguised through compiler thresholds.

## Manifest

Store a manifest beside its source PNGs. Paths are relative to that manifest. Each drawing needs a unique, permanent ID and title; category and compiler overrides are optional.

```json
{
  "schemaVersion": 1,
  "collection": "Portrait Atelier",
  "defaults": {
    "inkThreshold": 170,
    "minRegionArea": 40,
    "minInteriorArea": 12,
    "minInteriorRadius": 1.5,
    "simplifyPixels": 0.3
  },
  "drawings": [
    {
      "id": "atelier-example-v1",
      "title": "Example Portrait",
      "source": "example-original.png",
      "category": "Portrait Atelier",
      "tags": ["adult", "portrait", "glasses", "wavy hair"],
      "labels": [
        {"x": 0.5, "y": 0.45, "label": "face"}
      ]
    }
  ]
}
```

Optional label seeds use normalized original-image coordinates from 0 to 1. They name the connected white region at that position; seeds on ink produce a review warning. Unlabeled regions are named `portrait detail` or `background`. A drawing may override individual settings with a `compile` object.

Some expressive hairline strokes have tiny intentional-looking gaps that connect hair to skin during region tracing. A reviewed drawing may define `boundaryLinks` as explicit **vector fill-boundary guides**, each with normalized source-coordinate `from: [x, y]`, `to: [x, y]`, an optional `width` of 1–8 source pixels (default 2), and an explanatory `reason`. Links must be local bridges no longer than 80 source pixels. They affect only the region-extraction barrier; the source PNG and original fine ink contours are unchanged. The app's normal region outline renders each closed fill boundary. Review links against the source at high zoom and verify that face, hair, clothing, and background remain independently selectable. Avoid blanket morphology that could seal decorative details indiscriminately.

`inkThreshold` selects dark source pixels for the ink contour. `simplifyPixels` is a maximum contour approximation distance in source pixels (limited to 0.5). The other settings use logical canvas units: `minRegionArea` discards negligible regions, while `minInteriorRadius` and `minInteriorArea` require a usable interior beyond a narrow contour fringe. These settings remove frustrating slivers from selectable targets while keeping their original visible ink. They must not be raised merely to advertise an easier difficulty. Difficulty is always computed from actual retained regions: Easy ≤32, Medium 33–59, Hard ≥60.

## Compile and integrate

```sh
python3 -m venv /tmp/musemallow-art-tools
/tmp/musemallow-art-tools/bin/pip install opencv-python-headless==4.12.0.88 numpy==2.2.6
/tmp/musemallow-art-tools/bin/python scripts/compile-portrait-collection.py \
  artwork-sources/portrait-collection/manifest.json \
  --report artwork-sources/portrait-collection/compilation-report.json
```

The command creates `<id>.json`, `<id>.svg`, and `<id>.line.svg` under `public/art`. Both SVGs show uncolored line art; the thumbnail is intentionally a preview of the actual blank coloring page. Add `--update-catalogs` after review to merge the new browse entries into both `catalog.json` and `supplemental-catalog.json`. Existing catalog entries, IDs, order, and unrelated metadata are preserved. `npm run art:generate` subsequently preserves all supplemental entries. `--output /tmp/portrait-review` can compile outside the application for isolated review.

The optional report records source SHA-256 hashes, exact compiler settings, dimensions, region counts, discarded slivers, and browse metadata. Every page is 768 × 1024 logical units for consistent 2304 × 3072 exports. The compiler fits the source with one aspect-preserving scale factor and adds white margins where needed. Paper is padded before connected-component extraction, so page margins join the actual outside white region rather than forming an overlapping background shape. A portrait is never stretched to a different face shape.

Connected white components produce disjoint closed vector regions. OpenCV contour winding preserves holes; the separate filled ink contour retains fine eyelashes, hair strands, jewelry, and seams. The engine draws that ink above all paint, including exports. Geometry-derived region IDs are deterministic for identical source and settings.

## Review and versioning

Inspect line SVGs at fit-to-page and high zoom. Review facial anatomy, clothing joins, source shading artifacts, and regions that accidentally connect through a gap. Test face, hair, eye, jewelry, and fabric fills in the app, then guided shading, gradients, undo/redo, saved-work reopening, and export. An unusually large connected region in the report is a prompt to check boundaries, not automatically an error: blank background and continuous skin can be intentionally large.

Run `npm test -- tests/artwork.spec.ts` after integrating. Those checks validate path decoding, uniqueness, metadata, and selectable region interiors. The broader painting suite covers clipping and rendering. Automated geometry checks complement visual review; they cannot certify anatomy or recognize a semantic hair/skin boundary.

The Portrait Atelier collection also keeps `artwork-sources/portrait-collection/boundary-review.json`: manually reviewed forehead, cheek, hair, clothing, background, and lip locations in normalized source coordinates, paired with each source's SHA-256. `tests/portrait-collection.spec.ts` independently verifies those locations resolve to unambiguous vector regions and that skin stays separate from the sampled other materials. Include known problem locations after repairing a gap. Re-review these points when a source changes rather than moving them to make a test pass. The compilation report's `sourceScale` and `artworkOffsetX/Y` map a source pixel to its logical canvas position.

Existing geometry is protected: rerunning identical sources is allowed, but changed geometry under an existing ID fails. For a released drawing, use a new versioned ID. `--replace-existing` is available only for iterating on **unpublished** drawings. Existing saved paintings also retain their original geometry snapshots. Never remove older catalog IDs simply to add a new collection.
