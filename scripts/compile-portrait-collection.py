#!/usr/bin/env python3
"""Compile original PNG coloring pages into editable Musemallow vector assets.

The PNGs are immutable source material. This compiler extracts vector ink and
closed, nonoverlapping white regions; it does not retouch or rewrite an image.
Requires opencv-python-headless==4.12.0.88 and numpy==2.2.6.

Usage:
  python scripts/compile-portrait-collection.py artwork-sources/portraits/manifest.json
  python scripts/compile-portrait-collection.py MANIFEST --update-catalogs --report REPORT

Catalogs are unchanged unless --update-catalogs is supplied. See
docs/PORTRAIT-COMPILER.md for the manifest, review process, and versioning rules.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
from pathlib import Path
import re
import sys

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parent.parent
DEFAULTS = {
    "inkThreshold": 170,
    "minRegionArea": 40.0,
    "minInteriorArea": 12.0,
    "minInteriorRadius": 1.5,
    "simplifyPixels": 0.3,
}
INK = "#292535"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def json_text(value) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def atomic_write(path: Path, content: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)


def settings_for(defaults: dict, entry: dict) -> dict:
    settings = {**DEFAULTS, **defaults, **entry.get("compile", {})}
    unknown = set(settings) - set(DEFAULTS)
    if unknown:
        raise ValueError(f"Unknown compiler settings: {', '.join(sorted(unknown))}")
    for key, value in settings.items():
        if not isinstance(value, (int, float)) or not math.isfinite(value) or value <= 0:
            raise ValueError(f"{key} must be a positive finite number")
    if not 1 <= settings["inkThreshold"] <= 254:
        raise ValueError("inkThreshold must be between 1 and 254")
    if settings["simplifyPixels"] > 0.5:
        raise ValueError("simplifyPixels must be <= 0.5 to retain fine ink and boundaries")
    return settings


def load_gray(source: Path) -> np.ndarray:
    original = cv2.imread(str(source), cv2.IMREAD_UNCHANGED)
    if original is None:
        raise ValueError(f"Could not decode source: {source}")
    if original.dtype != np.uint8:
        raise ValueError(f"Source must be an 8-bit PNG: {source}")
    if original.ndim == 2:
        return original
    if original.shape[2] == 4:
        # White backing is the same paper used by the app, including transparent
        # source margins. This affects vector interpretation, not the source PNG.
        alpha = original[:, :, 3:4].astype(np.float32) / 255
        original = np.rint(original[:, :, :3] * alpha + 255 * (1 - alpha)).astype(np.uint8)
    return cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)


def compile_entry(entry: dict, manifest_directory: Path, defaults: dict):
    artwork_id = entry["id"]
    source = (manifest_directory / entry["source"]).resolve()
    if source.suffix.lower() != ".png":
        raise ValueError(f"{artwork_id}: use an original PNG source")
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    gray = load_gray(source)
    source_height, source_width = gray.shape
    if source_width < 600 or source_height < 800:
        raise ValueError(f"{artwork_id}: source should be at least 600 × 800 pixels")
    settings = settings_for(defaults, entry)
    width, height = 768, 1024
    scale = min(width / source_width, height / source_height)
    # Pad paper before connected-component extraction. Outside white areas and
    # page margins then form the same actual component, without an overlapping
    # synthetic background path. A single scale preserves faces and circles.
    working_width, working_height = round(width / scale), round(height / scale)
    left = (working_width - source_width) // 2
    top = (working_height - source_height) // 2
    gray = cv2.copyMakeBorder(gray, top, working_height - source_height - top,
                             left, working_width - source_width - left,
                             cv2.BORDER_CONSTANT, value=255)
    offset_x = (width - working_width * scale) / 2
    offset_y = (height - working_height * scale) / 2
    ink = (gray < settings["inkThreshold"]).astype(np.uint8) * 255
    # Author-reviewed fill topology is separate from original source ink. Short
    # vector guide links close specific hairline/garment gaps for region tracing;
    # the unchanged ink contours remain the visible fine-detail source layer.
    # The app's normal region outlines display the new closed boundary.
    fill_barrier = ink.copy()
    boundary_links = entry.get("boundaryLinks", [])
    if not isinstance(boundary_links, list):
        raise ValueError(f"{artwork_id}: boundaryLinks must be a list")
    for link in boundary_links:
        endpoints = []
        for key in ("from", "to"):
            point = link.get(key)
            if not isinstance(point, list) or len(point) != 2 or not all(isinstance(value, (int, float)) and math.isfinite(value) and 0 <= value <= 1 for value in point):
                raise ValueError(f"{artwork_id}: each boundary link needs normalized from/to [x, y]")
            endpoints.append((round(point[0] * (source_width - 1)) + left,
                              round(point[1] * (source_height - 1)) + top))
        thickness = link.get("width", 2)
        if not isinstance(thickness, (int, float)) or not math.isfinite(thickness) or not 1 <= thickness <= 8:
            raise ValueError(f"{artwork_id}: boundary link width must be 1–8 source pixels")
        if math.dist(endpoints[0], endpoints[1]) > 80:
            raise ValueError(f"{artwork_id}: boundary links must be local gap bridges (<=80 source pixels)")
        cv2.line(fill_barrier, endpoints[0], endpoints[1], 255, math.ceil(thickness), cv2.LINE_8)
    paper = cv2.bitwise_not(fill_barrier)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(paper, connectivity=4)

    def contour_path(contour, offset_left=0, offset_top=0):
        points = cv2.approxPolyDP(contour, settings["simplifyPixels"], True).reshape(-1, 2)
        if len(points) < 3:
            return ""
        pairs = [f"{(float(x) + offset_left) * scale + offset_x:.2f} {(float(y) + offset_top) * scale + offset_y:.2f}" for x, y in points]
        return "M " + " L ".join(pairs) + " Z"

    semantic_labels = {}
    warnings = []
    for seed in entry.get("labels", []):
        if not all(isinstance(seed.get(axis), (int, float)) and 0 <= seed[axis] <= 1 for axis in ("x", "y")):
            raise ValueError(f"{artwork_id}: label seeds need normalized x and y in [0, 1]")
        if not isinstance(seed.get("label"), str) or not seed["label"].strip():
            raise ValueError(f"{artwork_id}: each label seed needs a nonempty label")
        x = min(source_width - 1, round(seed["x"] * (source_width - 1)))
        y = min(source_height - 1, round(seed["y"] * (source_height - 1)))
        component = int(labels[y + top, x + left])
        if component == 0:
            warnings.append(f"Label '{seed['label']}' lies on ink and was not applied")
        elif component in semantic_labels and semantic_labels[component] != seed["label"]:
            warnings.append(f"Labels '{semantic_labels[component]}' and '{seed['label']}' share one connected region; first retained")
        else:
            semantic_labels[component] = seed["label"]

    regions = []
    discarded = 0
    max_region_area = 0.0
    for component in range(1, count):
        x, y, w, h, pixel_area = (int(value) for value in stats[component])
        area = pixel_area * scale * scale
        if area < settings["minRegionArea"]:
            discarded += 1
            continue
        # Work in the component bounding box; large portraits may contain
        # thousands of tiny white holes in fine eyelashes and jewelry.
        local_mask = (labels[y:y+h, x:x+w] == component).astype(np.uint8) * 255
        padded = cv2.copyMakeBorder(local_mask, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
        distance = cv2.distanceTransform(padded, cv2.DIST_L2, cv2.DIST_MASK_PRECISE)[1:-1, 1:-1] * scale
        interior_area = np.count_nonzero(distance > settings["minInteriorRadius"]) * scale * scale
        if interior_area < settings["minInteriorArea"]:
            discarded += 1
            continue
        contours, _ = cv2.findContours(local_mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        paths = [contour_path(contour, x, y) for contour in contours]
        path = " ".join(part for part in paths if part)
        if not path:
            discarded += 1
            continue
        # A geometry-derived ID remains deterministic even if unrelated tiny
        # components appear or disappear earlier in connected-component order.
        region_id = "region-" + hashlib.sha256(path.encode()).hexdigest()[:14]
        edge = x == 0 or y == 0 or x + w == working_width or y + h == working_height
        label = semantic_labels.get(component, "background" if edge else "portrait detail")
        regions.append({"id": region_id, "path": path, "label": label})
        max_region_area = max(max_region_area, area)
    if len(regions) < 6:
        raise ValueError(f"{artwork_id}: only {len(regions)} usable regions; review source boundaries/settings")
    if len({region["id"] for region in regions}) != len(regions):
        raise ValueError(f"{artwork_id}: duplicate region geometry")

    ink_contours, _ = cv2.findContours(ink, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    # OpenCV exterior/hole winding is opposite, so a compound Path2D preserves
    # white islands with the Canvas and SVG default nonzero fill rule.
    ink_path = " ".join(part for part in (contour_path(contour) for contour in ink_contours) if part)
    if not ink_path:
        raise ValueError(f"{artwork_id}: source has no usable ink")
    art = {
        "id": artwork_id, "width": width, "height": height, "disjointRegions": True,
        "regions": regions, "lines": [{"path": ink_path, "width": 0, "fill": INK}],
    }
    difficulty = "Easy" if len(regions) <= 32 else "Medium" if len(regions) < 60 else "Hard"
    metadata = {
        "id": artwork_id, "title": entry["title"], "category": entry.get("category", "Portrait Atelier"),
        "difficulty": difficulty, "tags": list(dict.fromkeys(entry["tags"])),
        "thumbnail": f"/art/{artwork_id}.svg", "regionCount": len(regions),
    }
    title = html.escape(entry["title"], quote=True)
    header = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" aria-label="{title}"><title>{title} — original Musemallow coloring page</title><rect width="{width}" height="{height}" fill="white"/>'
    # The app outlines region boundaries at 1.65 units before compositing ink.
    # Match that exactly in printable art and browse thumbnails.
    outlines = "".join(f'<path d="{region["path"]}" fill="none" stroke="{INK}" stroke-width="1.65" stroke-linejoin="round"/>' for region in regions)
    svg = header + outlines + f'<path d="{ink_path}" fill="{INK}"/></svg>\n'
    report = {
        "id": artwork_id, "source": entry["source"], "sourceSha256": source_hash,
        "sourceWidth": source_width, "sourceHeight": source_height,
        "sourceOffsetX": left, "sourceOffsetY": top, "sourceScale": scale,
        "artworkOffsetX": offset_x + left * scale, "artworkOffsetY": offset_y + top * scale,
        "width": width, "height": height, "settings": settings,
        "boundaryLinks": boundary_links,
        "regionCount": len(regions), "difficulty": difficulty,
        "discardedSmallOrThinRegions": discarded, "inkContours": len(ink_contours),
        "largestRegionFraction": round(max_region_area / (width * height), 4),
        "warnings": warnings,
    }
    return art, svg, metadata, report


def merge_metadata(existing: list, additions: list) -> list:
    updates = {entry["id"]: entry for entry in additions}
    merged = [{**entry, **updates.pop(entry["id"], {})} for entry in existing]
    return merged + list(updates.values())


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "public/art")
    parser.add_argument("--update-catalogs", action="store_true", help="Merge into both catalogs without removing existing entries")
    parser.add_argument("--report", type=Path, help="Write source hashes, geometry statistics, settings, and browse metadata")
    parser.add_argument("--replace-existing", action="store_true", help="Allow changed geometry for an unpublished ID; released drawings need a new versioned ID")
    args = parser.parse_args()
    manifest = read_json(args.manifest)
    if not isinstance(manifest, dict) or manifest.get("schemaVersion") != 1:
        raise ValueError("Manifest must have schemaVersion: 1")
    entries = manifest.get("drawings")
    if not isinstance(entries, list) or not entries:
        raise ValueError("Manifest drawings must be a nonempty list")
    ids, titles = set(), set()
    for entry in entries:
        for key in ("id", "title", "source"):
            if not isinstance(entry.get(key), str) or not entry[key].strip():
                raise ValueError(f"Each drawing needs a nonempty {key}")
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", entry["id"]):
            raise ValueError(f"Invalid stable artwork ID: {entry['id']}")
        if entry["id"] in ids or entry["title"] in titles:
            raise ValueError(f"Duplicate ID/title in manifest: {entry['id']}")
        if not isinstance(entry.get("tags"), list) or not entry["tags"] or not all(isinstance(tag, str) and tag.strip() for tag in entry["tags"]):
            raise ValueError(f"{entry['id']}: tags must be a nonempty list of strings")
        ids.add(entry["id"])
        titles.add(entry["title"])

    # Validate every source and collision before writing any compiled assets.
    compiled = [compile_entry(entry, args.manifest.resolve().parent, manifest.get("defaults", {})) for entry in entries]
    catalog_path = args.output / "catalog.json"
    supplemental_path = args.output / "supplemental-catalog.json"
    catalog = read_json(catalog_path) if catalog_path.exists() else []
    supplemental = read_json(supplemental_path) if supplemental_path.exists() else []
    supplemental_ids = {entry["id"] for entry in supplemental}
    for existing in catalog:
        if existing["id"] in ids and existing["id"] not in supplemental_ids:
            raise ValueError(f"Cannot replace a main collection ID: {existing['id']}")
        if existing["title"] in titles and existing["id"] not in ids:
            raise ValueError(f"Title already exists in library: {existing['title']}")
    for art, _, _, _ in compiled:
        asset = args.output / f"{art['id']}.json"
        if asset.exists() and read_json(asset) != art and not args.replace_existing:
            raise ValueError(f"{art['id']}: geometry differs from existing asset. Use a new versioned ID; --replace-existing is only for unpublished work")
    for art, svg, metadata, report in compiled:
        atomic_write(args.output / f"{art['id']}.json", json.dumps(art, ensure_ascii=False, separators=(",", ":")) + "\n")
        atomic_write(args.output / f"{art['id']}.svg", svg)
        atomic_write(args.output / f"{art['id']}.line.svg", svg)
        print(f"{art['id']}: {metadata['regionCount']} usable regions ({metadata['difficulty']}), {art['width']} × {art['height']}")
        for warning in report["warnings"]:
            print(f"  Review: {warning}", file=sys.stderr)
    metadata = [item[2] for item in compiled]
    if args.update_catalogs:
        atomic_write(supplemental_path, json_text(merge_metadata(supplemental, metadata)))
        atomic_write(catalog_path, json_text(merge_metadata(catalog, metadata)))
    if args.report:
        atomic_write(args.report, json_text({"schemaVersion": 1, "collection": manifest.get("collection", "Portrait collection"), "drawings": [item[3] for item in compiled], "metadata": metadata}))
    print(f"Compiled {len(compiled)} drawings. Catalogs {'merged' if args.update_catalogs else 'unchanged (use --update-catalogs to integrate)'}. Sources unchanged.")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, ValueError, OSError) as error:
        print(f"Portrait compilation failed: {error}", file=sys.stderr)
        sys.exit(1)
