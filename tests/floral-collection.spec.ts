import { test, expect, type Page } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Artwork, ArtworkMeta, CanvasSettings } from '../src/types';

const sourceDirectory = 'artwork-sources/floral-reverie';
const readJSON = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8'));
const collection = async () => (await readJSON<ArtworkMeta[]>('public/art/catalog.json')).filter(item => item.category === 'Floral Reverie');
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
interface SourcePair {
  id: string; source: string; colorSource: string; referenceImage: string;
  generator: string; generationPrompt: string; colorGenerationPrompt: string;
}

test('six original PNG line and color pairs are bundled without changing the previous 133 drawings', async ({ page }) => {
  const catalog = await readJSON<ArtworkMeta[]>('public/art/catalog.json');
  const additions = await collection();
  expect(additions).toHaveLength(6);
  expect(catalog.length).toBeGreaterThanOrEqual(139);
  // Frozen before the first Floral Reverie compilation. Includes every previous
  // metadata entry plus editable geometry and both preview SVGs, preserving saves.
  const previousLibrary = await readJSON<{ ids: string[] }>('artwork-sources/quiet-moments/previous-library.json');
  const original = catalog.filter(item => previousLibrary.ids.includes(item.id) && !item.id.startsWith('floral-') && !item.id.startsWith('dreamlight-')).sort((a, b) => a.id.localeCompare(b.id));
  expect(original).toHaveLength(133);
  const digest = createHash('sha256');
  for (const item of original) {
    digest.update(JSON.stringify(item));
    for (const extension of ['json', 'svg', 'line.svg']) digest.update(await readFile(`public/art/${item.id}.${extension}`));
  }
  expect(digest.digest('hex')).toBe('853b64448e69a4d994bf114944a04855756e7d0ab29a963195572131ef57d512');

  const manifest = await readJSON<{ schemaVersion: number; drawings: SourcePair[] }>(`${sourceDirectory}/manifest.json`);
  expect(manifest.schemaVersion).toBe(1);
  expect(manifest.drawings.map(item => item.id).sort()).toEqual(additions.map(item => item.id).sort());
  const pngs = (await readdir(sourceDirectory)).filter(file => file.endsWith('.png')).sort();
  expect(pngs).toHaveLength(12);
  expect(manifest.drawings.flatMap(item => [item.source, item.colorSource]).sort()).toEqual(pngs);
  const sourceHashes = new Set<string>(), geometryHashes = new Set<string>();
  for (const item of additions) {
    const pair = manifest.drawings.find(drawing => drawing.id === item.id)!;
    expect(pair.generator).toBe('OpenAI image_gen');
    expect(pair.generationPrompt.length).toBeGreaterThan(100);
    expect(pair.colorGenerationPrompt.length).toBeGreaterThan(100);
    expect(item.referenceImage).toBe(`/references/${item.id}.png`);
    expect(pair.referenceImage).toBe(item.referenceImage);
    const line = await readFile(path.join(sourceDirectory, pair.source));
    const color = await readFile(path.join(sourceDirectory, pair.colorSource));
    for (const [label, bytes] of [['line', line], ['color', color]] as const) {
      expect([...bytes.subarray(0, 8)], `${item.title}: ${label} PNG signature`).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
      expect(bytes.readUInt32BE(16), `${item.title}: ${label} width`).toBeGreaterThanOrEqual(768);
      expect(bytes.readUInt32BE(20), `${item.title}: ${label} height`).toBeGreaterThanOrEqual(1024);
      sourceHashes.add(sha256(bytes));
    }
    expect([color.readUInt32BE(16), color.readUInt32BE(20)], `${item.title}: matching source dimensions`).toEqual([line.readUInt32BE(16), line.readUInt32BE(20)]);
    expect(sha256(await readFile(`public${item.referenceImage}`)), `${item.title}: offline reference is the unchanged generated PNG`).toBe(sha256(color));
    const art = await readJSON<Artwork>(`public/art/${item.id}.json`);
    expect(art.id).toBe(item.id);
    expect(art.disjointRegions).toBe(true);
    expect(art.regions.length).toBe(item.regionCount);
    expect(item.difficulty).toBe(item.regionCount <= 32 ? 'Easy' : item.regionCount <= 59 ? 'Medium' : 'Hard');
    expect(new Set(art.regions.map(region => region.id)).size).toBe(art.regions.length);
    geometryHashes.add(sha256(Buffer.from(JSON.stringify(art.regions.map(region => region.path)))));
  }
  expect(sourceHashes.size).toBe(12);
  expect(geometryHashes.size).toBe(6);

  await page.goto('/tests/harness.html');
  const pixels = await page.evaluate(async pairs => {
    async function inspect(url: string) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Image unavailable: ${url}`);
      const image = await createImageBitmap(await response.blob());
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); image.close();
      const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let colored = 0, white = 0, ink = 0, samples = 0;
      for (let p = 0; p < rgba.length; p += 16) {
        const low = Math.min(rgba[p], rgba[p + 1], rgba[p + 2]), high = Math.max(rgba[p], rgba[p + 1], rgba[p + 2]);
        if (high - low >= 18 && low < 230) colored++;
        if (low >= 245) white++;
        if (high < 170) ink++;
        samples++;
      }
      return { colored: colored / samples, white: white / samples, ink: ink / samples };
    }
    return Promise.all(pairs.map(async pair => ({ id: pair.id, line: await inspect(`/artwork-sources/floral-reverie/${pair.source}`), color: await inspect(pair.referenceImage) })));
  }, manifest.drawings);
  for (const item of pixels) {
    expect(item.line.colored, `${item.id}: uncolored source`).toBeLessThan(.005);
    expect(item.line.white, `${item.id}: usable white interiors`).toBeGreaterThan(.4);
    expect(item.line.ink, `${item.id}: actual drawn contours`).toBeGreaterThan(.01);
    expect(item.color.colored, `${item.id}: meaningful colored reference`).toBeGreaterThan(.15);
  }
});

/**
 * Derive test locations independently from a full-resolution label raster.
 * No illustration-specific guessed coordinates or renderer hit-test internals.
 * The distance pass excludes anti-aliased edges and fine ink before picking points.
 */
async function inspectDrawing(art: Artwork) {
  const canvas = document.createElement('canvas'); canvas.width = art.width; canvas.height = art.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const colors = new Map<number, number>();
  art.regions.forEach((region, index) => {
    const color = (index + 1) * 1771; colors.set(color, index);
    ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
    ctx.fill(new Path2D(region.path));
  });
  const raster = ctx.getImageData(0, 0, art.width, art.height).data;
  const labels = new Int32Array(art.width * art.height).fill(-1);
  for (let pixel = 0; pixel < labels.length; pixel++) {
    const p = pixel * 4;
    if (raster[p + 3] === 255) labels[pixel] = colors.get((raster[p] << 16) | (raster[p + 1] << 8) | raster[p + 2]) ?? -1;
  }
  ctx.clearRect(0, 0, art.width, art.height); ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
  for (const line of art.lines) {
    const shape = new Path2D(line.path);
    if (line.fill) ctx.fill(shape);
    if ((line.width ?? 1.7) > 0) { ctx.lineWidth = line.width ?? 1.7; ctx.stroke(shape); }
  }
  const ink = ctx.getImageData(0, 0, art.width, art.height).data;
  const distance = new Float32Array(labels.length);
  const width = art.width, height = art.height;
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const p = y * width + x;
    if (labels[p] < 0 || ink[p * 4 + 3] > 0) continue;
    distance[p] = Math.min(labels[p - 1] === labels[p] ? distance[p - 1] + 1 : 0, labels[p - width] === labels[p] ? distance[p - width] + 1 : 0);
  }
  for (let y = height - 2; y > 0; y--) for (let x = width - 2; x > 0; x--) {
    const p = y * width + x;
    distance[p] = Math.min(distance[p], labels[p + 1] === labels[p] ? distance[p + 1] + 1 : 0, labels[p + width] === labels[p] ? distance[p + width] + 1 : 0);
  }
  const centers = art.regions.map((region, index) => ({ id: region.id, index, x: 0, y: 0, clearance: 0 }));
  for (let p = 0; p < labels.length; p++) {
    const index = labels[p];
    if (index >= 0 && distance[p] > centers[index].clearance) centers[index] = { ...centers[index], x: p % width + .5, y: Math.floor(p / width) + .5, clearance: distance[p] };
  }
  const candidates = centers.filter(point => point.clearance >= 6);
  const target = candidates.filter(point => point.x > width * .25 && point.x < width * .75 && point.y > height * .18 && point.y < height * .6).sort((a, b) => b.clearance - a.clearance)[0];
  if (!target) throw new Error('No comfortable central coloring region in generated portrait');
  const neighbour = candidates.filter(point => point.index !== target.index).sort((a, b) => Math.hypot(a.x - target.x, a.y - target.y) - Math.hypot(b.x - target.x, b.y - target.y))[0];
  if (!neighbour) throw new Error('No independently selectable neighbour in generated portrait');
  let left = target, right = target;
  for (let y = 4; y < height - 4; y += 3) for (let x = 4; x < width - 4; x += 3) {
    const p = y * width + x;
    if (labels[p] !== target.index || distance[p] < 6) continue;
    if (x < left.x) left = { ...target, x: x + .5, y: y + .5 };
    if (x > right.x) right = { ...target, x: x + .5, y: y + .5 };
  }
  (window as any).collectionRaster = { art, labels, distance, target };
  return { target, neighbour, left, right, comfortableRegions: candidates.length };
}

async function screenPoint(page: Page, point: { x: number; y: number }) {
  return page.evaluate(point => {
    const canvas = document.querySelector('.painting-canvas')!;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min((rect.width - 24) / 768, (rect.height - 24) / 1024);
    return { x: rect.left + (rect.width - 768 * scale) / 2 + point.x * scale, y: rect.top + (rect.height - 1024 * scale) / 2 + point.y * scale };
  }, point);
}
async function settings(page: Page, values: Partial<CanvasSettings>) { await page.evaluate(values => (window as any).collectionEngine.setSettings(values), values); }
async function tap(page: Page, point: { x: number; y: number }) { const p = await screenPoint(page, point); await page.mouse.click(p.x, p.y); }
async function stroke(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  const start = await screenPoint(page, a), end = await screenPoint(page, b);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 12 }); await page.mouse.up();
}

async function inspectPaint(page: Page) {
  return page.evaluate(async () => {
    const w = window as any;
    const blob = await w.collectionEngine.exportImage('png', 1);
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].join(',');
    const bitmap = await createImageBitmap(blob), canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0); bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const { labels, distance, target } = w.collectionRaster;
    if (!w.collectionBaseline) w.collectionBaseline = pixels.slice();
    let changedInside = 0, changedOutside = 0, checkedOutside = 0;
    for (let p = 0; p < labels.length; p += 3) {
      if (distance[p] < 5) continue;
      const changed = [0, 1, 2].some(offset => Math.abs(pixels[p * 4 + offset] - w.collectionBaseline[p * 4 + offset]) > 2);
      if (labels[p] === target.index) { if (changed) changedInside++; }
      else { checkedOutside++; if (changed) changedOutside++; }
    }
    const point = (position: { x: number; y: number }) => [...ctx.getImageData(Math.floor(position.x), Math.floor(position.y), 1, 1).data];
    return { hash, changedInside, changedOutside, checkedOutside, targetPixel: point(target), left: point(w.collectionPoints.left), right: point(w.collectionPoints.right) };
  });
}

test('the most detailed floral page keeps fill, shading and gradients inside its actual regions', async ({ page }) => {
  const additions = await collection();
  const representative = [...additions].sort((a, b) => b.regionCount - a.regionCount)[0];
  expect(representative).toBeTruthy();
  const art = await readJSON<Artwork>(`public/art/${representative.id}.json`);
  await page.goto('/tests/harness.html');
  const points = await page.evaluate(inspectDrawing, art);
  expect(points.comfortableRegions).toBeGreaterThan(5);
  await page.evaluate(async ({ art, points }) => {
    const { PaintingCanvas } = await import('/src/canvas.ts');
    const w = window as any; w.collectionPoints = points;
    w.collectionEngine = new PaintingCanvas(document.querySelector('#studio')!, art, [], { onChange: () => {} });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, { art, points });
  const empty = await inspectPaint(page);
  expect(empty.checkedOutside).toBeGreaterThan(1000);
  await settings(page, { tool: 'fill', color: '#e06070', opacity: 1 });
  await tap(page, points.target);
  const fill = await inspectPaint(page);
  expect(fill.targetPixel).toEqual([224, 96, 112, 255]);
  expect(fill.changedInside).toBeGreaterThan(100);
  expect(fill.changedOutside).toBe(0);
  await page.evaluate(() => (window as any).collectionEngine.undo());
  expect((await inspectPaint(page)).hash).toBe(empty.hash);
  await page.evaluate(() => (window as any).collectionEngine.redo());
  expect((await inspectPaint(page)).hash).toBe(fill.hash);

  await page.evaluate(id => { const engine = (window as any).collectionEngine; engine.reset(); engine.lockRegion(id); }, points.target.id);
  await settings(page, { tool: 'airbrush', size: 180, color: '#324574', opacity: .8, guided: true });
  await stroke(page, points.target, points.neighbour);
  const shade = await inspectPaint(page);
  expect(shade.changedInside).toBeGreaterThan(100);
  expect(shade.changedOutside).toBe(0);
  await page.evaluate(() => { const engine = (window as any).collectionEngine; engine.reset(); engine.lockRegion(); });
  await settings(page, { tool: 'gradient', color: '#ff0000', secondaryColor: '#0000ff', opacity: 1 });
  await stroke(page, points.left, points.right);
  const gradient = await inspectPaint(page);
  expect(gradient.changedInside).toBeGreaterThan(100);
  expect(gradient.changedOutside).toBe(0);
  expect(gradient.left[0]).toBeGreaterThan(220); expect(gradient.left[2]).toBeLessThan(35);
  expect(gradient.right[2]).toBeGreaterThan(220); expect(gradient.right[0]).toBeLessThan(35);
});

type ReviewPoint = [number, number];
interface BoundaryReview {
  id: string; source: string; sourceSha256: string;
  face: ReviewPoint; cheek?: ReviewPoint; lips: ReviewPoint[]; hair: ReviewPoint[]; petals: ReviewPoint[]; leaves: ReviewPoint[];
  garment?: ReviewPoint; background: ReviewPoint; backgrounds?: ReviewPoint[];
}
interface SourceTransform {
  id: string; sourceSha256: string; sourceWidth: number; sourceHeight: number;
  sourceScale: number; artworkOffsetX: number; artworkOffsetY: number;
}

test('reviewed skin, lips, hair, petals and leaves stay independently fillable in all six floral pages', async ({ page }, testInfo) => {
  const directory = sourceDirectory;
  const review = await readJSON<{ schemaVersion: number; drawings: BoundaryReview[] }>(`${directory}/boundary-review.json`);
  const report = await readJSON<{ drawings: SourceTransform[] }>(`${directory}/compilation-report.json`);
  const additions = await collection();
  expect(review.schemaVersion).toBe(1);
  expect(review.drawings.map(item => item.id).sort()).toEqual(additions.map(item => item.id).sort());
  const inputs = [];
  for (const item of review.drawings) {
    for (const group of ['hair', 'petals', 'leaves'] as const) expect(item[group].length, `${item.id}: review multiple ${group} regions`).toBeGreaterThanOrEqual(2);
    expect(item.lips.length, `${item.id}: review lips independently of skin`).toBeGreaterThanOrEqual(1);
    expect(item.cheek, `${item.id}: review forehead and cheek`).toBeDefined();
    if (item.id === 'floral-peony-daydream-v1') expect(item.backgrounds?.length, 'Preserve the garment-to-disconnected-exterior leak regression probe').toBeGreaterThanOrEqual(1);
    const sourceHash = createHash('sha256').update(await readFile(path.join(directory, item.source))).digest('hex');
    expect(item.sourceSha256, `${item.id}: changed sources require a fresh semantic review`).toBe(sourceHash);
    const transform = report.drawings.find(drawing => drawing.id === item.id)!;
    expect(transform?.sourceSha256, `${item.id}: compiled geometry must use the reviewed source`).toBe(sourceHash);
    for (const value of [transform.sourceScale, transform.artworkOffsetX, transform.artworkOffsetY]) expect(Number.isFinite(value)).toBe(true);
    const art = await readJSON<Artwork>(`public/art/${item.id}.json`);
    inputs.push({ review: item, transform, art });
  }
  await page.goto('/tests/harness.html');
  const results = await page.evaluate(inputs => {
    const context = document.createElement('canvas').getContext('2d')!;
    return inputs.map(({ review, transform, art }) => {
      const regions = art.regions.map(region => ({ id: region.id, path: new Path2D(region.path) }));
      const ink = art.lines.map(line => ({ ...line, shape: new Path2D(line.path) }));
      const seedGroups: [string, 'skin' | 'hair' | 'lip' | 'petal' | 'leaf' | 'garment' | 'background', [number, number]][] = [
        ['face', 'skin', review.face],
        ...(review.cheek ? [['cheek', 'skin', review.cheek] as [string, 'skin', [number, number]]] : []),
        ...(review.lips ?? []).map((point, index) => [`lip-${index + 1}`, 'lip', point] as [string, 'lip', [number, number]]),
        ...review.hair.map((point, index) => [`hair-${index + 1}`, 'hair', point] as [string, 'hair', [number, number]]),
        ...review.petals.map((point, index) => [`petal-${index + 1}`, 'petal', point] as [string, 'petal', [number, number]]),
        ...review.leaves.map((point, index) => [`leaf-${index + 1}`, 'leaf', point] as [string, 'leaf', [number, number]]),
        ...(review.garment ? [['garment', 'garment', review.garment] as [string, 'garment', [number, number]]] : []),
        ['background', 'background', review.background],
        ...(review.backgrounds ?? []).map((point, index) => [`background-${index + 2}`, 'background', point] as [string, 'background', [number, number]]),
      ];
      const hit = (x: number, y: number) => regions.filter(region => context.isPointInPath(region.path, x, y)).map(region => region.id);
      const points = seedGroups.map(([name, group, point]) => {
        // These are manually reviewed source locations, never inferred from the
        // compiled masks. Moving a probe to a convenient region would hide leaks.
        const x = point[0] * (transform.sourceWidth - 1) * transform.sourceScale + transform.artworkOffsetX;
        const y = point[1] * (transform.sourceHeight - 1) * transform.sourceScale + transform.artworkOffsetY;
        const hits = hit(x, y);
        const stable = [[-.5, 0], [.5, 0], [0, -.5], [0, .5]].every(([dx, dy]) => JSON.stringify(hit(x + dx, y + dy)) === JSON.stringify(hits));
        const onInk = ink.some(line => {
          if (line.fill && context.isPointInPath(line.shape, x, y)) return true;
          if ((line.width ?? 1.7) <= 0) return false;
          context.lineWidth = line.width ?? 1.7;
          return context.isPointInStroke(line.shape, x, y);
        });
        return { name, group, sourcePoint: point, x, y, hits, stable, onInk };
      });
      const failures: string[] = [];
      for (const point of points) {
        if (point.hits.length !== 1) failures.push(`${point.name} hits ${point.hits.length} coloring regions`);
        if (!point.stable || point.onInk) failures.push(`${point.name} needs an off-ink, unambiguous review point`);
      }
      for (let index = 0; index < points.length; index++) {
        const first = points[index];
        for (const other of points.slice(index + 1).filter(point => point.group !== first.group)) {
          if (first.hits.some(id => other.hits.includes(id))) failures.push(`${first.name} leaks into ${other.name} (${first.hits.join(', ')})`);
        }
      }
      return { id: review.id, points, failures };
    });
  }, inputs);
  await testInfo.attach('reviewed-semantic-boundaries', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(results.flatMap(result => result.failures.map(failure => `${result.id}: ${failure}`))).toEqual([]);
});
