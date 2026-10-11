import type { Page } from '@playwright/test';
import type { Artwork, CanvasSettings } from '../../src/types';

// Derive painting test locations from a full-resolution label raster, excluding
// antialias edges and fine ink. Semantic boundaries use separate reviewed probes.
export async function inspectDrawing(art: Artwork) {
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

export async function screenPoint(page: Page, point: { x: number; y: number }) {
  return page.evaluate(point => {
    const canvas = document.querySelector('.painting-canvas')!;
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min((rect.width - 24) / 768, (rect.height - 24) / 1024);
    return { x: rect.left + (rect.width - 768 * scale) / 2 + point.x * scale, y: rect.top + (rect.height - 1024 * scale) / 2 + point.y * scale };
  }, point);
}
export async function settings(page: Page, values: Partial<CanvasSettings>) { await page.evaluate(values => (window as any).collectionEngine.setSettings(values), values); }
export async function tap(page: Page, point: { x: number; y: number }) { const p = await screenPoint(page, point); await page.mouse.click(p.x, p.y); }
export async function stroke(page: Page, a: { x: number; y: number }, b: { x: number; y: number }) {
  const start = await screenPoint(page, a), end = await screenPoint(page, b);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 12 }); await page.mouse.up();
}

export async function inspectPaint(page: Page) {
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
