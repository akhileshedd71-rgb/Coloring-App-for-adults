import { test, expect, type Page } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Artwork, ArtworkMeta, CanvasSettings } from '../src/types';

const readJSON = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8'));
const collection = async () => (await readJSON<ArtworkMeta[]>('public/art/catalog.json')).filter(item => item.category === 'Portrait Atelier');
const originalIds = [
  ...['portrait', 'beauty', 'hair', 'editorial', 'street', 'evening', 'heritage', 'vintage', 'figure', 'fantasy']
    .flatMap(prefix => Array.from({ length: 12 }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`)),
  'artist-braided-reverie',
];

test('the twelve generated portraits are distinct additions and preserve the original editable library', async () => {
  const catalog = await readJSON<ArtworkMeta[]>('public/art/catalog.json');
  const additions = await collection();
  expect(additions).toHaveLength(12);
  expect(catalog).toHaveLength(133);
  // Frozen from the original release: metadata, region IDs/paths and preview assets.
  // This catches accidental regeneration that would invalidate existing saved commands.
  const original = catalog.filter(item => originalIds.includes(item.id)).sort((a, b) => a.id.localeCompare(b.id));
  expect(original).toHaveLength(121);
  const digest = createHash('sha256');
  for (const item of original) {
    digest.update(JSON.stringify(item));
    for (const extension of ['json', 'svg', 'line.svg']) digest.update(await readFile(`public/art/${item.id}.${extension}`));
  }
  expect(digest.digest('hex')).toBe('b79c763164422aba43d26b23e1d0d85ef6f8a73a9958b67953c7039232070d7d');

  const sourceDir = 'artwork-sources/portrait-collection';
  const manifest = await readJSON<{ drawings: { id: string; source: string }[] }>(path.join(sourceDir, 'manifest.json'));
  expect(manifest.drawings.map(item => item.id).sort()).toEqual(additions.map(item => item.id).sort());
  const sources = (await readdir(sourceDir)).filter(file => file.endsWith('.png'));
  expect(sources).toHaveLength(12);
  expect(manifest.drawings.map(item => item.source).sort()).toEqual(sources.sort());
  const sourceHashes = new Set<string>();
  for (const file of sources) {
    const bytes = await readFile(path.join(sourceDir, file));
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.readUInt32BE(16), file).toBeGreaterThanOrEqual(768);
    expect(bytes.readUInt32BE(20), file).toBeGreaterThanOrEqual(1024);
    sourceHashes.add(createHash('sha256').update(bytes).digest('hex'));
  }
  expect(sourceHashes.size).toBe(12);
  const geometry = new Set<string>();
  for (const item of additions) {
    const art = await readJSON<Artwork>(`public/art/${item.id}.json`);
    expect(art.regions.length, item.title).toBe(item.regionCount);
    expect(item.difficulty, item.title).toBe(item.regionCount <= 32 ? 'Easy' : item.regionCount <= 59 ? 'Medium' : 'Hard');
    geometry.add(createHash('sha256').update(JSON.stringify(art.regions.map(region => region.path))).digest('hex'));
  }
  expect(geometry.size).toBe(12);
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

test('the most detailed generated portrait keeps fill, shading and gradients inside its irregular regions', async ({ page }) => {
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

test('new portraits are discoverable by filters and reopen with the same saved colors', async ({ page }) => {
  const additions = await collection();
  const representative = additions.find(item => item.difficulty === 'Medium') ?? additions[0];
  expect(representative).toBeTruthy();
  const art = await readJSON<Artwork>(`public/art/${representative.id}.json`);
  await page.goto('/');
  await page.locator('[data-category="Portrait Atelier"]').click();
  await expect(page.locator('.art-card')).toHaveCount(12);
  await page.locator('#difficulty').selectOption(representative.difficulty);
  await expect(page.locator('.art-card')).toHaveCount(additions.filter(item => item.difficulty === representative.difficulty).length);
  await page.locator('#search').fill(representative.title);
  await expect(page.locator('.art-card')).toHaveCount(1);
  await page.locator(`[data-action="open-art"][data-id="${representative.id}"]`).first().click();
  await expect(page.locator('.painting-canvas')).toBeVisible();
  const points = await page.evaluate(inspectDrawing, art);
  await tap(page, points.target);
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  const saved = await page.evaluate(async () => {
    const storage = await import('/src/storage.ts');
    return storage.getDocument((await storage.listDocuments())[0].id);
  });
  expect(saved?.commands).toHaveLength(1);
  expect(saved?.commands[0].regionId).toBe(points.target.id);
  expect(saved?.artworkSnapshot).toEqual(art);
  await page.waitForTimeout(350);
  const before = await page.locator('canvas').evaluate((el: HTMLCanvasElement) => el.toDataURL());
  await page.reload();
  await page.locator('.continue-section [data-action="open-doc"]').first().click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(350);
  const after = await page.locator('canvas').evaluate((el: HTMLCanvasElement) => el.toDataURL());
  expect(after).toBe(before);
});

type ReviewPoint = [number, number];
interface BoundaryReview {
  id: string; source: string; sourceSha256: string;
  face: ReviewPoint; cheek?: ReviewPoint; lip?: ReviewPoint; lips?: ReviewPoint[]; hair: ReviewPoint[];
  garment: ReviewPoint; background: ReviewPoint;
}
interface SourceTransform {
  id: string; sourceSha256: string; sourceWidth: number; sourceHeight: number;
  sourceScale: number; artworkOffsetX: number; artworkOffsetY: number;
}

test('reviewed skin areas remain separate from actual hair, clothing and background in every new portrait', async ({ page }, testInfo) => {
  const directory = 'artwork-sources/portrait-collection';
  const review = await readJSON<{ schemaVersion: number; drawings: BoundaryReview[] }>(`${directory}/boundary-review.json`);
  const report = await readJSON<{ drawings: SourceTransform[] }>(`${directory}/compilation-report.json`);
  const additions = await collection();
  expect(review.schemaVersion).toBe(1);
  expect(review.drawings.map(item => item.id).sort()).toEqual(additions.map(item => item.id).sort());
  const inputs = [];
  for (const item of review.drawings) {
    expect(item.hair.length, `${item.id}: review multiple hair areas, including previously leaking locks`).toBeGreaterThanOrEqual(2);
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
      const seedGroups: [string, 'skin' | 'hair' | 'lip' | 'garment' | 'background', [number, number]][] = [
        ['face', 'skin', review.face],
        ...(review.cheek ? [['cheek', 'skin', review.cheek] as [string, 'skin', [number, number]]] : []),
        ...(review.lip ? [['lip', 'lip', review.lip] as [string, 'lip', [number, number]]] : []),
        ...(review.lips ?? []).map((point, index) => [`lip-${index + 1}`, 'lip', point] as [string, 'lip', [number, number]]),
        ...review.hair.map((point, index) => [`hair-${index + 1}`, 'hair', point] as [string, 'hair', [number, number]]),
        ['garment', 'garment', review.garment], ['background', 'background', review.background],
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
      for (const skin of points.filter(point => point.group === 'skin')) {
        for (const other of points.filter(point => point.group !== 'skin')) {
          if (skin.hits.some(id => other.hits.includes(id))) failures.push(`${skin.name} leaks into ${other.name} (${skin.hits.join(', ')})`);
        }
      }
      return { id: review.id, points, failures };
    });
  }, inputs);
  await testInfo.attach('reviewed-semantic-boundaries', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(results.flatMap(result => result.failures.map(failure => `${result.id}: ${failure}`))).toEqual([]);
});
