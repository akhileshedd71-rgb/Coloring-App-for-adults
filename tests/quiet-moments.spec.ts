import { test, expect } from '@playwright/test';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { Artwork, ArtworkMeta } from '../src/types';
import { inspectDrawing, inspectPaint, settings, tap, stroke, screenPoint } from './helpers/painting-artwork';

const directory = 'artwork-sources/quiet-moments';
const readJSON = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8'));
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const collection = async () => (await readJSON<ArtworkMeta[]>('public/art/catalog.json')).filter(item => item.category === 'Quiet Moments');
type Point = [number, number];
interface Review {
  id: string; source: string; sourceSha256: string;
  face: Point; cheek: Point; hair: Point[]; lips: Point[]; garment: Point; background: Point;
}
interface Transform {
  id: string; sourceSha256: string; sourceWidth: number; sourceHeight: number;
  sourceScale: number; artworkOffsetX: number; artworkOffsetY: number;
}

test('twenty original generated pages expand the library while preserving all 149 previous drawings', async () => {
  const catalog = await readJSON<ArtworkMeta[]>('public/art/catalog.json');
  const additions = await collection();
  expect(additions).toHaveLength(20);
  expect(catalog.length).toBeGreaterThanOrEqual(169);
  const baseline = await readJSON<{ count: number; ids: string[]; sha256: string }>(`${directory}/previous-library.json`);
  expect(baseline.count).toBe(149);
  const previous = catalog.filter(item => baseline.ids.includes(item.id)).sort((a, b) => a.id.localeCompare(b.id));
  expect(previous).toHaveLength(149);
  const digest = createHash('sha256');
  for (const item of previous) {
    digest.update(JSON.stringify(item));
    for (const extension of ['json', 'svg', 'line.svg']) digest.update(await readFile(`public/art/${item.id}.${extension}`));
    if (item.referenceImage) digest.update(await readFile(`public${item.referenceImage}`));
  }
  expect(digest.digest('hex')).toBe(baseline.sha256);
  const manifest = await readJSON<{ drawings: { id: string; source: string; generator: string; generationPrompt: string }[] }>(`${directory}/manifest.json`);
  const supplemental = await readJSON<ArtworkMeta[]>('public/art/supplemental-catalog.json');
  const report = await readJSON<{ drawings: Transform[] }>(`${directory}/compilation-report.json`);
  expect(manifest.drawings.map(x => x.id).sort()).toEqual(additions.map(x => x.id).sort());
  expect((await readdir(directory)).filter(x => x.endsWith('.png')).sort()).toEqual(manifest.drawings.map(x => x.source).sort());
  const hashes = new Set<string>();
  for (const entry of manifest.drawings) {
    expect(entry.generator).toBe('OpenAI image_gen');
    expect(entry.generationPrompt.length).toBeGreaterThan(200);
    const bytes = await readFile(`${directory}/${entry.source}`);
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes.readUInt32BE(16)).toBeGreaterThanOrEqual(768);
    expect(bytes.readUInt32BE(20)).toBeGreaterThanOrEqual(1024);
    expect(report.drawings.find(x => x.id === entry.id)?.sourceSha256).toBe(sha256(bytes));
    hashes.add(sha256(bytes));
    const meta = additions.find(x => x.id === entry.id)!;
    expect(supplemental.find(x => x.id === entry.id)).toEqual(meta);
    const art = await readJSON<Artwork>(`public/art/${entry.id}.json`);
    expect(art.disjointRegions).toBe(true);
    expect(art.regions).toHaveLength(meta.regionCount);
    expect(meta.difficulty).toBe(meta.regionCount <= 32 ? 'Easy' : meta.regionCount < 60 ? 'Medium' : 'Hard');
    expect(meta.referenceImage).toBeUndefined();
  }
  expect(hashes.size).toBe(20);
});

test('reviewed face, hair or headwear, lips, clothing and paper remain independently fillable on every new page', async ({ page }, testInfo) => {
  const review = await readJSON<{ drawings: Review[] }>(`${directory}/boundary-review.json`);
  const report = await readJSON<{ drawings: Transform[] }>(`${directory}/compilation-report.json`);
  expect(review.drawings.map(x => x.id).sort()).toEqual((await collection()).map(x => x.id).sort());
  const inputs = [];
  for (const r of review.drawings) {
    expect(r.hair.length).toBeGreaterThanOrEqual(2);
    expect(r.lips.length).toBeGreaterThanOrEqual(1);
    expect(r.sourceSha256).toBe(sha256(await readFile(`${directory}/${r.source}`)));
    const transform = report.drawings.find(x => x.id === r.id)!;
    expect(transform.sourceSha256).toBe(r.sourceSha256);
    inputs.push({ review: r, transform, art: await readJSON<Artwork>(`public/art/${r.id}.json`) });
  }
  await page.goto('/tests/harness.html');
  const results = await page.evaluate(inputs => {
    const c = document.createElement('canvas').getContext('2d')!;
    return inputs.map(({ review: r, transform: t, art }) => {
      const regions = art.regions.map(region => ({ id: region.id, shape: new Path2D(region.path) }));
      const ink = art.lines.map(line => new Path2D(line.path));
      const groups: [string, string, Point][] = [
        ['face', 'skin', r.face], ['cheek', 'skin', r.cheek],
        ...r.hair.map((p, i) => [`hair-${i}`, 'hair/headwear', p] as [string, string, Point]),
        ...r.lips.map((p, i) => [`lip-${i}`, 'lip', p] as [string, string, Point]),
        ['garment', 'garment', r.garment], ['paper', 'paper', r.background],
      ];
      const points = groups.map(([name, group, p]) => {
        const x = p[0] * (t.sourceWidth - 1) * t.sourceScale + t.artworkOffsetX;
        const y = p[1] * (t.sourceHeight - 1) * t.sourceScale + t.artworkOffsetY;
        const hit = (x: number, y: number) => regions.filter(region => c.isPointInPath(region.shape, x, y)).map(region => region.id);
        const hits = hit(x, y);
        const stable = [[0, 0], [-.5, 0], [.5, 0], [0, -.5], [0, .5]].every(([dx, dy]) =>
          JSON.stringify(hit(x + dx, y + dy)) === JSON.stringify(hits) && !ink.some(path => c.isPointInPath(path, x + dx, y + dy)));
        return { name, group, hits, stable };
      });
      const failures: string[] = [];
      for (const p of points) {
        if (p.hits.length !== 1 || !p.stable) failures.push(`${p.name} is not a clear fill target`);
        for (const q of points.filter(q => q.group !== p.group)) {
          if (p.hits.some(id => q.hits.includes(id))) failures.push(`${p.name} leaks into ${q.name}`);
        }
      }
      return { id: r.id, points, failures };
    });
  }, inputs);
  await testInfo.attach('quiet-moments-boundaries', { body: JSON.stringify(results, null, 2), contentType: 'application/json' });
  expect(results.flatMap(r => r.failures.map(f => `${r.id}: ${f}`))).toEqual([]);
});

test('Quiet Moments is discoverable and every new drawing opens as blank editable art', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-category="Quiet Moments"]').click();
  await expect(page.locator('.art-card')).toHaveCount(20);
  await expect(page.locator('.category-chip').nth(1)).toHaveText('Quiet Moments');
  await page.locator('#search').fill('Cedar Storyteller');
  await expect(page.locator('.art-card')).toHaveCount(1);
  await page.locator('#search').fill('');
  for (const art of await collection()) {
    await page.locator(`[data-action="open-art"][data-id="${art.id}"]`).first().click();
    await expect(page.locator('.painting-canvas')).toBeVisible();
    const pixels = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const rgba = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let ink = 0, paper = 0;
      for (let p = 0; p < rgba.length; p += 16) {
        if (rgba[p] < 100 && rgba[p + 1] < 100 && rgba[p + 2] < 100) ink++;
        if (rgba[p] > 245 && rgba[p + 1] > 245 && rgba[p + 2] > 245) paper++;
      }
      return { ink, paper };
    });
    expect(pixels.ink, art.title).toBeGreaterThan(100);
    expect(pixels.paper, art.title).toBeGreaterThan(1000);
    await page.locator('[data-action="back"]').click();
  }
});

test('coloring a new portrait autosaves and reopens with identical pixels and commands', async ({ page }) => {
  const art = (await collection())[0];
  const review = (await readJSON<{ drawings: Review[] }>(`${directory}/boundary-review.json`)).drawings[0];
  const t = (await readJSON<{ drawings: Transform[] }>(`${directory}/compilation-report.json`)).drawings[0];
  await page.goto('/');
  await page.locator('[data-category="Quiet Moments"]').click();
  await page.locator(`[data-action="open-art"][data-id="${art.id}"]`).first().click();
  await expect(page.locator('.painting-canvas')).toBeVisible();
  const point = await screenPoint(page, { x: review.face[0] * (t.sourceWidth - 1) * t.sourceScale + t.artworkOffsetX, y: review.face[1] * (t.sourceHeight - 1) * t.sourceScale + t.artworkOffsetY });
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  const stored = () => page.evaluate(async () => { const s = await import('/src/storage.ts'); const docs = await s.listDocuments(); return s.getDocument(docs[0].id); });
  expect((await stored())?.commands).toHaveLength(1);
  await page.locator('[data-action="undo"]').click();
  await expect.poll(async () => (await stored())?.commands.length).toBe(0);
  await page.locator('[data-action="redo"]').click();
  await expect.poll(async () => (await stored())?.commands.length).toBe(1);
  const before = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  const document = await stored();
  expect(document?.artworkSnapshot?.id).toBe(art.id);
  await page.reload();
  await page.locator('.continue-section [data-action="open-doc"]').first().click();
  await expect(page.locator('.painting-canvas')).toBeVisible();
  await expect.poll(() => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);
  expect((await stored())?.commands).toEqual(document?.commands);
});

test('the most detailed Quiet Moments page keeps fill, shading and gradients inside its actual regions', async ({ page }) => {
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
