# Running app screenshots

These are captures of the implemented application, not design mockups.

| Screen | Capture |
| --- | --- |
| Phone library | [phone-library.png](phone-library.png) |
| Phone painting canvas | [phone-editor.png](phone-editor.png) |
| Brush tools | [phone-tools.png](phone-tools.png) |
| Color palettes | [phone-palettes.png](phone-palettes.png) |
| Saved gallery | [phone-gallery.png](phone-gallery.png) |
| Dark theme | [phone-dark.png](phone-dark.png) |
| Tablet library | [tablet-library.png](tablet-library.png) |
| Tablet canvas | [tablet-editor.png](tablet-editor.png) |
| Landscape canvas | [landscape-editor.png](landscape-editor.png) |
| Desktop development view | [desktop-library.png](desktop-library.png) |
| New portrait collection on phone | [phone-portrait-atelier.png](phone-portrait-atelier.png) |
| Complete new collection on tablet | [tablet-portrait-atelier.png](tablet-portrait-atelier.png) |
| New couture coloring page | [phone-atelier-canvas.png](phone-atelier-canvas.png) |
| New portrait with actual color fills | [phone-atelier-coloring.png](phone-atelier-coloring.png) |
| Floral Reverie on phone | [phone-floral-reverie.png](phone-floral-reverie.png) |
| Six new floral portraits | [tablet-floral-reverie.png](tablet-floral-reverie.png) |
| Matching colored example | [phone-colored-reference.png](phone-colored-reference.png) |
| Painting with a pinned reference | [phone-reference-pinned.png](phone-reference-pinned.png) |
| Tablet reference beside canvas | [tablet-reference-pinned.png](tablet-reference-pinned.png) |
| Reference in landscape | [landscape-reference.png](landscape-reference.png) |

The painting captures use actual fill-tool interactions on Braided Reverie. The source remains editable in local storage. Run `node scripts/capture-screenshots.mjs` with the development server running to recreate this set in a fresh browser context.

Run `node scripts/capture-portrait-collection.mjs` for the new collection captures. These show the actual blank vector pages and saved fill-tool interactions in version 1.1.

Run `node scripts/capture-floral-reverie.mjs` for the version 1.2 library and reference viewer. The pinned-reference captures include a real saved skin fill. The reference PNG is displayed separately from the canvas and does not appear in exported artwork.
