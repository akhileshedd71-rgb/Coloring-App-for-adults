# Portrait Atelier — 12 new coloring pages

This collection was generated specifically for Musemallow in response to the supplied portrait references. It includes glamorous couture, flowing waves, round glasses, expressive adult faces, headbands, braids, jewelry, and simpler contemporary characters. Every subject is an adult. Each PNG is the untouched image-generation output; the references themselves are not bundled or traced.

All 12 original pages were visually reviewed for facial proportions, eyes, ears, neck joins, hair, clothing, and clean white coloring areas. There are no hands in these chest-up compositions. The generated source was then compiled into sharp vector ink and independent closed coloring regions. Source aspect ratios are preserved. Tiny white slivers are not advertised as targets, while their fine ink remains visible.

The final measured collection has **2 Easy, 2 Medium, and 8 Hard drawings**. The `easy`, `medium`, or `hard` wording in source filenames records the generation brief, not the final difficulty. For example, Sunday Spectacles generated more detail than requested and is correctly shown as Hard. Difficulty is determined by actual usable regions; each page opens completely uncolored.

| Drawing | Difficulty | Regions | Line art |
| --- | --- | ---: | --- |
| Moonlit Couture | Hard | 372 | [SVG](../../public/art/atelier-moonlit-couture-v1.line.svg) |
| Café Daydream | Hard | 149 | [SVG](../../public/art/atelier-cafe-daydream-v1.line.svg) |
| Silken Reverie | Hard | 118 | [SVG](../../public/art/atelier-silken-reverie-v1.line.svg) |
| Windflower Muse | Hard | 610 | [SVG](../../public/art/atelier-windflower-muse-v1.line.svg) |
| Bob & Bright Eyes | Medium | 41 | [SVG](../../public/art/atelier-bob-bright-eyes-v1.line.svg) |
| Sunday Spectacles | Hard | 66 | [SVG](../../public/art/atelier-sunday-spectacles-v1.line.svg) |
| Crowned in Grace | Hard | 767 | [SVG](../../public/art/atelier-crowned-in-grace-v1.line.svg) |
| Grace in Bloom | Easy | 17 | [SVG](../../public/art/atelier-grace-in-bloom-v1.line.svg) |
| Velvet Premiere | Medium | 59 | [SVG](../../public/art/atelier-velvet-premiere-v1.line.svg) |
| Quiet Editorial | Hard | 64 | [SVG](../../public/art/atelier-quiet-editorial-v1.line.svg) |
| The Botanical Gentleman | Hard | 360 | [SVG](../../public/art/atelier-the-botanical-gentleman-v1.line.svg) |
| Swept Away | Easy | 27 | [SVG](../../public/art/atelier-swept-away-v1.line.svg) |

## Sources and reproducibility

- [`manifest.json`](manifest.json) contains stable published IDs, original PNG filenames, full generation prompts, adult subject tags, and visual review notes.
- [`compilation-report.json`](compilation-report.json) records original source SHA-256 hashes, source dimensions, exact extraction settings, vector region counts, and final metadata.
- [`boundary-review.json`](boundary-review.json) records manually reviewed skin, hair, lip, garment, and background sample points for the semantic boundary regression test.
- [`../../scripts/compile-portrait-collection.py`](../../scripts/compile-portrait-collection.py) compiles these same sources deterministically. Image generation itself is not deterministic; the saved PNGs are the reproducible inputs.
- The [compiler guide](../../docs/PORTRAIT-COMPILER.md) explains source design, aspect ratio, closed boundaries, versioning, and safe catalog merging.

Using the optional art tools from the compiler guide:

```sh
python scripts/compile-portrait-collection.py \
  artwork-sources/portrait-collection/manifest.json \
  --update-catalogs \
  --report artwork-sources/portrait-collection/compilation-report.json
npm test -- tests/artwork.spec.ts tests/portrait-collection.spec.ts
```

Some generated contours contain tiny open hairline or lip gaps. Author-reviewed `boundaryLinks` in the manifest define short vector barriers for the coloring-region model, without retouching the source PNG or removing its fine ink. Sunday Spectacles also received an image-generation edit to close its hairline; that edit prompt is retained in the manifest. The automated semantic check verifies actual face/hair/lip separation using fixed manually reviewed source locations, in addition to the general painting-mask tests.

The application bundles compiled vectors and requires no runtime image service or internet connection. New pages use their own IDs; the original 121 drawings and their geometry are retained unchanged. Existing saved paintings also retain their original geometry snapshots.

The most intricate braid/jewelry pages have hundreds of regions and are intended for pinch zoom. Browser tests exercise actual fill, locked shading, gradients, undo/redo, autosave, and reopening on the generated art. Artistic review and browser tests do not replace device-specific performance testing.
