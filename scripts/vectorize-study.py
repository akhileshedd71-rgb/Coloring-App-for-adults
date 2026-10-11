#!/usr/bin/env python3
"""Extract editable closed vector regions and ink contours from our original study.

This is asset compilation: the original generated drawing is kept unchanged in
artwork-sources/. Requires opencv-python-headless==4.12.0.88 and numpy==2.2.6.
No runtime Python/image processing is shipped in the Android app.
"""
import json
from pathlib import Path
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'artwork-sources/braided-reverie-original.png'
OUT = ROOT / 'public/art'
ID = 'artist-braided-reverie'
image = cv2.imread(str(SOURCE), cv2.IMREAD_GRAYSCALE)
assert image is not None
height, width = image.shape
sx, sy = 768 / width, 1024 / height
# Keep fine lashes, braid strands, and garment seams. Contours, not the bitmap,
# are rendered in the final app, including when zoomed or exported at 3x.
ink = (image < 160).astype(np.uint8) * 255
paper = cv2.bitwise_not(ink)

def contour_path(contour):
    points = cv2.approxPolyDP(contour, .35, True).reshape(-1, 2)
    if len(points) < 3:
        return ''
    pairs = [f'{x*sx:.2f} {y*sy:.2f}' for x, y in points]
    return 'M ' + ' L '.join(pairs) + ' Z'

count, labels, stats, centers = cv2.connectedComponentsWithStats(paper, 8)
regions = []
colors = []
palette = ['#54383e', '#76515b', '#946979', '#b58c98']
for component in range(1, count):
    # Very small holes remain white under the original ink. They are not listed
    # as frustrating, near-invisible coloring targets or counted as regions.
    area = stats[component, cv2.CC_STAT_AREA] * sx * sy
    if area < 40:
        continue
    mask = (labels == component).astype(np.uint8) * 255
    # Exclude slivers along anti-aliased eyelashes/hair: area alone can include
    # a long subpixel channel that has no usable interior at logical resolution.
    if cv2.countNonZero(cv2.erode(mask, np.ones((3, 3), dtype=np.uint8))) < 10:
        continue
    contours, hierarchy = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    paths = [contour_path(c) for c in contours]
    path = ' '.join(p for p in paths if p)
    if not path:
        continue
    cx, cy = centers[component] * [sx, sy]
    label = 'portrait detail'
    color = '#fffaf6'
    if area > 30000 and cy > 360 and 220 < cx < 540:
        label, color = 'face and neckline', '#be8867'
    elif cy < 440 and 110 < cx < 660:
        label, color = 'braid segment', palette[component % len(palette)]
    elif cy > 770:
        label, color = 'embroidered fabric', ['#d9cee8', '#b9cdbd', '#f2d396'][component % 3]
    elif 570 < cy < 655 and 300 < cx < 470:
        label, color = 'lip', '#c87585'
    elif 430 < cy < 560 and (cx < 240 or cx > 550):
        label, color = 'ear', '#be8867'
    elif cy > 480 and (cx < 240 or cx > 550):
        label, color = 'earring jewel', ['#dfb85f', '#eacb83', '#bdb0d9'][component % 3]
    # Detect outside background by whether this region reaches the page edge.
    x, y, w, h = stats[component, :4]
    if (x == 0 or x + w == width) and cy < 750:
        label, color = 'background', '#f6ede7'
    regions.append({'id': f'study-{component:03}', 'path': path, 'label': label})
    colors.append(color)

ink_contours, _ = cv2.findContours(ink, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
# OpenCV gives outside/inside contours opposite winding; Path2D nonzero fill
# preserves all eyes, braid spaces, and jewelry holes in this compound path.
ink_path = ' '.join(p for p in (contour_path(c) for c in ink_contours) if p)
art = {'id': ID, 'width': 768, 'height': 1024, 'disjointRegions': True, 'regions': regions,
       'lines': [{'path': ink_path, 'width': 0, 'fill': '#292535'}]}
(OUT / f'{ID}.json').write_text(json.dumps(art, separators=(',', ':')) + '\n')
header = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 768 1024" width="768" height="1024"><title>Braided Reverie — original artist study</title><rect width="768" height="1024" fill="white"/>'
ink_svg = f'<path d="{ink_path}" fill="#292535"/>'
preview = ''.join(f'<path d="{r["path"]}" fill="{color}" stroke="{color}" stroke-width="1.5"/>' for r, color in zip(regions, colors))
(OUT / f'{ID}.svg').write_text(header + preview + ink_svg + '</svg>\n')
(OUT / f'{ID}.line.svg').write_text(header + ink_svg + '</svg>\n')
metadata = {'id': ID, 'title': 'Braided Reverie', 'category': 'Artist Studies',
            'difficulty': 'Hard', 'tags': ['realistic', 'portrait', 'adult', 'braided', 'original generated study', 'ornate'],
            'thumbnail': f'/art/{ID}.svg', 'regionCount': len(regions)}
(OUT / 'supplemental-catalog.json').write_text(json.dumps([metadata], indent=2) + '\n')
catalog = json.loads((OUT / 'catalog.json').read_text()) if (OUT / 'catalog.json').exists() else []
catalog = [metadata] + [entry for entry in catalog if entry['id'] != ID]
(OUT / 'catalog.json').write_text(json.dumps(catalog, indent=2) + '\n')
print(f'Compiled {len(regions)} selectable vector regions; {len(ink_contours)} ink contours; original {width}x{height}.')
