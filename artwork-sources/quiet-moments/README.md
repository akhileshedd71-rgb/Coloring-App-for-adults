# Quiet Moments

Twenty original generated adult coloring illustrations expand Musemallow from **149 to 169 drawings**. The collection explores botanical portraits, mature faces, hair, tailoring, textiles, and quiet everyday style. Each drawing has its own composition and permanent `quiet-…-v1` ID.

All twenty original PNGs are 1086 × 1448. The app uses aspect-preserving 768 × 1024 editable vectors, crisp vector ink, and self-contained SVG thumbnails. The collection contains **5,765 usable coloring regions**, with 153–762 per page; all are classified Hard by the existing region-count rules. The app's existing Easy and Medium drawings remain available.

| Drawing | Generated source | Compiled artwork | Regions |
| --- | --- | --- | ---: |
| Ginkgo Grace | [Original PNG](ginkgo-grace-line.png) | [Editable line SVG](../../public/art/quiet-ginkgo-grace-v1.line.svg) | 159 |
| Cedar Storyteller | [Original PNG](cedar-storyteller-line.png) | [Editable line SVG](../../public/art/quiet-cedar-storyteller-v1.line.svg) | 353 |
| Lotus Morning | [Original PNG](lotus-morning-line.png) | [Editable line SVG](../../public/art/quiet-lotus-morning-v1.line.svg) | 315 |
| Citrus Sunday | [Original PNG](citrus-sunday-line.png) | [Editable line SVG](../../public/art/quiet-citrus-sunday-v1.line.svg) | 462 |
| Harbor Poet | [Original PNG](harbor-poet-line.png) | [Editable line SVG](../../public/art/quiet-harbor-poet-v1.line.svg) | 307 |
| Magnolia Twilight | [Original PNG](magnolia-twilight-line.png) | [Editable line SVG](../../public/art/quiet-magnolia-twilight-v1.line.svg) | 153 |
| Velvet Muse | [Original PNG](velvet-muse-line.png) | [Editable line SVG](../../public/art/quiet-velvet-muse-v1.line.svg) | 170 |
| Olive Daydream | [Original PNG](olive-daydream-line.png) | [Editable line SVG](../../public/art/quiet-olive-daydream-v1.line.svg) | 274 |
| Peacock Silk | [Original PNG](peacock-silk-line.png) | [Editable line SVG](../../public/art/quiet-peacock-silk-v1.line.svg) | 169 |
| Dahlia Dancer | [Original PNG](dahlia-dancer-line.png) | [Editable line SVG](../../public/art/quiet-dahlia-dancer-v1.line.svg) | 193 |
| Willow Wanderer | [Original PNG](willow-wanderer-line.png) | [Editable line SVG](../../public/art/quiet-willow-wanderer-v1.line.svg) | 193 |
| Camomile Comfort | [Original PNG](camomile-comfort-line.png) | [Editable line SVG](../../public/art/quiet-camomile-comfort-v1.line.svg) | 254 |
| Poppy Serenade | [Original PNG](poppy-serenade-line.png) | [Editable line SVG](../../public/art/quiet-poppy-serenade-v1.line.svg) | 258 |
| Saffron Loom | [Original PNG](saffron-loom-line.png) | [Editable line SVG](../../public/art/quiet-saffron-loom-v1.line.svg) | 360 |
| Fern Archivist | [Original PNG](fern-archivist-line.png) | [Editable line SVG](../../public/art/quiet-fern-archivist-v1.line.svg) | 762 |
| Orchid Sonata | [Original PNG](orchid-sonata-line.png) | [Editable line SVG](../../public/art/quiet-orchid-sonata-v1.line.svg) | 198 |
| Moonflower Evening | [Original PNG](moonflower-evening-line.png) | [Editable line SVG](../../public/art/quiet-moonflower-evening-v1.line.svg) | 328 |
| Maple Melody | [Original PNG](maple-melody-line.png) | [Editable line SVG](../../public/art/quiet-maple-melody-v1.line.svg) | 345 |
| Iris Atelier | [Original PNG](iris-atelier-line.png) | [Editable line SVG](../../public/art/quiet-iris-atelier-v1.line.svg) | 170 |
| Garden Heirloom | [Original PNG](garden-heirloom-line.png) | [Editable line SVG](../../public/art/quiet-garden-heirloom-v1.line.svg) | 342 |

## Color in the app

Choose **Quiet Moments**, the first collection filter. Search by title or details such as ginkgo, headwrap, glasses, or peacock. Every page opens uncolored and is bundled for offline use. Fill, guided brushes, gradients, undo/redo, autosave, and image export use the existing painting engine. These twenty additions are coloring pages without separate colored-reference images.

## Sources and review

`manifest.json` records the exact OpenAI image-generation prompt for each original PNG, stable IDs, tags, compiler settings, and reviewed vector boundary guides. Generated PNGs remain unchanged. Guides follow faint hairlines, lips, sideburns, and beard edges so adjacent materials can be filled independently. They change the editable geometry, not the original image.

`compilation-report.json` records immutable source hashes, dimensions, coordinate transforms, region counts, and discarded tiny slivers. `boundary-review.json` fixes reviewed forehead, cheek, multiple hair/headwear, lip, clothing, and paper locations to each source hash. The Saffron Loom hair/headwear probes sample its wrap. These checks complement visual inspection; very small decorative marks remain ink details.

`previous-library.json` freezes all 149 earlier IDs and a digest over their complete metadata, geometry, both SVGs, and existing reference images. The expansion leaves that entire library byte-identical. Saved paintings retain their original geometry snapshots.

## Recompile and verify

Use the pinned OpenCV/NumPy environment from [the compiler guide](../../docs/PORTRAIT-COMPILER.md):

```sh
/tmp/musemallow-art-tools/bin/python scripts/compile-portrait-collection.py \
  artwork-sources/quiet-moments/manifest.json \
  --update-catalogs \
  --report artwork-sources/quiet-moments/compilation-report.json
npm run build
npm test -- tests/quiet-moments.spec.ts tests/artwork.spec.ts
```

Five collection tests protect the earlier library, source provenance, reviewed material boundaries, opening every addition, actual fill/shading/gradient pixels, undo/redo, and pixel-identical autosave/reopening. The full suite also exercises every thumbnail and reachable region across the expanded library.

Run `node scripts/capture-quiet-moments.mjs` with Vite running to reproduce the phone/tablet library and saved-painting screenshots in `docs/screenshots/`. This source expansion is included in new web builds and subsequent Capacitor builds; the previously committed version 1.3 APK has not been replaced.
