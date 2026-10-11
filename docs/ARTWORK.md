# Musemallow artwork collection

The bundled collection contains 120 original, editable vector illustrations, plus any separately authored studies listed in `public/art/supplemental-catalog.json`. The main collection uses a cohesive, stylized editorial illustration language: elongated adult faces, defined brows and lips, textile details, gentle expressions, and clean silhouettes. It is intentionally stylized rather than photorealistic.

The vectors are authored in [`scripts/generate-art.mjs`](../scripts/generate-art.mjs); they do not use stock illustrations, downloaded tracing templates, external fonts, or remote image requests. All drawing data is bundled for offline use. Colored browse previews demonstrate six coordinated palettes and a range of skin tones; the actual drawing opens as uncolored line art and the artist chooses every color.

## Collection

Each composition family has 12 drawings. Names, geometry, hair construction, expression, wardrobe, pose, and detail density combine to make distinct compositions rather than copies with renamed IDs.

| Category | Subjects and construction |
| --- | --- |
| Portraits | Adult faces, soft smiles, closed eyes, mature facial lines, beards, varied face width and jaw shapes |
| Faces & Features | Large beauty studies with brows, eyelashes, eyelids, iris regions, lips, freckles, and expressive eyes |
| Hair Stories | Bobs, short curls, coils, braids, swept cuts, waves, topknots, locs, straight lengths, ponytails, headwraps, and finger waves |
| Fashion Editorial | Sculptural collars, tailoring, hats, sunglasses, statement jewelry, and embroidered details |
| Streetwear | Hoodies, denim pockets and collars, bomber panels, beanies, graphic tees, cuffs, and buttons |
| Gowns & Suits | Bodices, long pleated skirts, lapels, bow ties, necklace beads, and embellished fabric |
| Cultural Threads | Garments inspired by sari drapes, kimono folds and obi, embroidered shawls, kurta plackets, hanbok ribbons, and woven vests |
| Vintage Studio | Wide-brim hats, berets, cloches, headbands, neck scarves, pearls, and patterned fabric |
| Figures & Movement | Standing, walking, seated, cross-legged, reaching, and dancing adult figures, with closed limb and garment shapes |
| Dreamer Portraits | Botanical crowns, tiaras, winged diadems, decorated mantles, and fantasy human portraits |

The cultural collection is an original, respectful interpretation of textile and silhouette ideas, not a claim of ethnographic costume accuracy. Face and clothing choices are not locked to any identity or skin color.

## Editable asset format

- `public/art/catalog.json`: lightweight browse metadata: `id`, `title`, `category`, `difficulty`, `tags`, `thumbnail`, and `regionCount`.
- `public/art/<id>.json`: 768 × 1024 editable master, loaded only when the drawing is opened.
- `public/art/<id>.svg`: self-contained colored preview.
- `public/art/<id>.line.svg`: self-contained uncolored vector source for review, print, and editing.
- `public/art/supplemental-catalog.json`: metadata for separately authored artwork. Its entries are appended during generation; the generator never rewrites supplemental drawing files.

The master uses this contract:

```json
{
  "id": "example-study-v1",
  "width": 768,
  "height": 1024,
  "regions": [
    { "id": "r001", "path": "M 0 0 L 768 0 L 768 1024 L 0 1024 Z", "label": "background" }
  ],
  "lines": [
    { "path": "M 320 420 Q 384 450 448 420", "width": 1.5 }
  ]
}
```

Regions are **closed paths in back-to-front order**. A later region sits over an earlier region. The painting engine subtracts later shapes when locking or painting an earlier region, so filling the face cannot color the eyes, lips, or overlapping hair. Decorative lines are separate from paintable regions and remain crisp when zooming. A background region always covers the page.

Fine eyelashes, pupil marks, folds, seams, and wrinkles use line paths. Meaningful iris, lip, hair, garment, jewelry, and embroidery shapes use closed regions. The library never depends on a raster flood-fill finding a gap-free outline.

## Difficulty and boundaries

Difficulty is calculated from the final **visible** coloring region count, after hidden construction shapes have been removed:

- **Easy:** up to 32 regions, primarily broad facial, hair, and clothing areas.
- **Medium:** 33–59 regions, with smaller locks of hair, garment panels, jewelry, and patterns.
- **Hard:** 60 or more regions, with intricate braid sections, embroidery, pleats, or ornament.

The hard compositions also contain more fine line detail. Small features become practical to select using zoom. Region counts describe usable targets rather than hidden layering scaffolds.

During generation, headless Chromium paints every region with a unique diagnostic color at full source resolution, then checks the number of visible pixels after all overlays. Wholly hidden or negligible construction shapes are removed; this repeats until stable. A minimum twelve-pixel interior margin keeps antialias fringes from being counted as useful paint targets. This also catches off-page or occluded accessories. The authored shape IDs are retained when hidden shapes are removed.

## Regenerate the main collection

```sh
npm ci
# Use the installed Chromium, or install the Playwright browser on your workstation:
npx playwright install chromium
npm run art:generate
npm test -- tests/artwork.spec.ts
```

On Linux the generator uses `/usr/bin/chromium` when available. Set `CHROMIUM_PATH=/absolute/path/to/chromium` to select another installation. Otherwise it uses Playwright's installed Chromium. Generation is deterministic for the current source and supplemental metadata and does not contact an image service.

## Add a drawing

1. Design an adult human composition at 768 × 1024. Keep the face or figure central, vary the silhouette and pose, and place detailed anatomy intentionally.
2. Author closed regions with the `Art.region()` builder and fine detail with `Art.line()`. Use absolute `M`, `L`, `Q`, `C`, and `Z` commands in this generator. A mirrored transform must specify `sy: 1` when only the horizontal axis should flip.
3. Draw background and rear hair/limbs first, then clothing, neck, face, front hair, and accessories. Confirm that face and eye regions overlap intentionally and that iris shapes remain inside the eyelids.
4. Add a uniquely named composition and metadata to a collection, or create `<new-id>.json`, a self-contained thumbnail, and an entry in `supplemental-catalog.json` for separately authored assets. Supplemental IDs must not duplicate a main collection ID.
5. Run generation and the artwork tests. Inspect colored and uncolored previews at fit-to-page and high zoom. Pay particular attention to eyes, jaw and neck joins, fingers, bent elbows and knees, hairline seams, collars, and overlapping jewelry.
6. Open the new drawing in the app. Fill adjoining face/hair/eye regions, shade along their boundaries, test a gradient, undo/redo, reopen the saved painting, and compare its exported image.
7. Give changed geometry a **new versioned artwork ID** once released. Existing saved paintings include a snapshot of their artwork data, but stable IDs and region identities make library updates easier to reason about. Do not repurpose an old ID for a different drawing.

## Review and validation

The collection was reviewed using rendered contact sheets, with individual anatomy fixes for mirrored facial features, hair silhouettes, irises, bent elbows, and seated legs. `tests/artwork.spec.ts` verifies at least 100 unique geometries, unique IDs and titles, complete metadata and files, all ten categories, three difficulty levels, valid closed paths, substantial visible line art, decodable previews, and reachable region interiors. Painting-specific clipping, navigation, history, save/restore, and export checks live in the canvas and application test suites.

Automated boundary checks establish geometric reachability and fill containment; they do not replace artistic review. The generated collection is a cohesive stylized library. Supplemental artist studies may use a different level of realism and have their own source and process notes.
