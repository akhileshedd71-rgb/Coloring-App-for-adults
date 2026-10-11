import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { Artwork, ArtworkMeta } from '../src/types';

const publicDir = path.resolve('public');
const readJSON = async <T>(filename: string): Promise<T> => JSON.parse(await readFile(filename, 'utf8'));

test('bundled library contains 100 distinct, complete drawings across categories and difficulties', async () => {
  const catalog = await readJSON<ArtworkMeta[]>(path.join(publicDir, 'art/catalog.json'));
  expect(catalog.length).toBeGreaterThanOrEqual(100);
  expect(new Set(catalog.map(item => item.id)).size).toBe(catalog.length);
  expect(new Set(catalog.map(item => item.title)).size).toBe(catalog.length);
  expect(new Set(catalog.map(item => item.category)).size).toBeGreaterThanOrEqual(10);
  expect(new Set(catalog.map(item => item.difficulty))).toEqual(new Set(['Easy', 'Medium', 'Hard']));
  const geometry = new Set<string>();
  const detail: Record<string, number[]> = { Easy: [], Medium: [], Hard: [] };
  for (const item of catalog) {
    expect(item.id).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(item.tags.length).toBeGreaterThan(0);
    const drawing = await readJSON<Artwork>(path.join(publicDir, 'art', `${item.id}.json`));
    expect(drawing.id).toBe(item.id);
    expect(drawing.width).toBeGreaterThanOrEqual(600);
    expect(drawing.height).toBeGreaterThanOrEqual(800);
    expect(drawing.regions.length).toBe(item.regionCount);
    expect(drawing.regions.length).toBeGreaterThan(5);
    expect(new Set(drawing.regions.map(region => region.id)).size).toBe(drawing.regions.length);
    for (const region of drawing.regions) {
      expect(region.path, `${item.id}/${region.id} must be closed`).toMatch(/[zZ]\s*$/);
      expect(region.path).not.toMatch(/NaN|Infinity|undefined/);
      expect(region.path).toMatch(/^[mM]/);
    }
    const signature = JSON.stringify({ regions: drawing.regions.map(region => region.path), lines: drawing.lines });
    geometry.add(createHash('sha256').update(signature).digest('hex'));
    detail[item.difficulty].push(drawing.regions.length + drawing.lines.length);
    const thumbnail = await readFile(path.join(publicDir, item.thumbnail.replace(/^\//, '')));
    expect(thumbnail.length).toBeGreaterThan(100);
  }
  expect(geometry.size, 'unique IDs must not disguise duplicate geometry').toBe(catalog.length);
  const average = (xs: number[]) => xs.reduce((sum, n) => sum + n, 0) / xs.length;
  expect(average(detail.Hard), 'hard drawings should have more actual detail').toBeGreaterThan(average(detail.Easy));
});

test('all SVG paths parse and every drawing has substantial visible line art', async ({ page }) => {
  await page.goto('/tests/harness.html');
  const validation = await page.evaluate(async () => {
    const catalog = await (await fetch('/art/catalog.json')).json();
    const failures: string[] = [];
    const counts: number[] = [];
    for (const meta of catalog) {
      const art = await (await fetch(`/art/${meta.id}.json`)).json();
      const canvas = document.createElement('canvas');
      canvas.width = 192; canvas.height = 256;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(canvas.width / art.width, canvas.height / art.height);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      const paths = [...art.regions.map((r: any) => r.path), ...art.lines.map((l: any) => l.path)];
      for (const path of paths) {
        try { ctx.stroke(new Path2D(path)); }
        catch { failures.push(`${meta.id}: invalid SVG path`); }
      }
      const pixels = ctx.getImageData(0, 0, 192, 256).data;
      let count = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 80) count++;
      counts.push(count);
      if (count < 400) failures.push(`${meta.id}: blank or negligible drawing (${count} pixels)`);
    }
    return { failures, checked: counts.length, min: Math.min(...counts) };
  });
  expect(validation.failures).toEqual([]);
  expect(validation.checked).toBeGreaterThanOrEqual(100);
});

test('all bundled thumbnails decode as self-contained images', async ({ page }) => {
  await page.goto('/tests/harness.html');
  const thumbnails = await page.evaluate(async () => {
    const catalog = await (await fetch('/art/catalog.json')).json();
    const results = [];
    for (const item of catalog) {
      const response = await fetch(item.thumbnail);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image(); image.src = url; await image.decode();
        results.push({ id: item.id, width: image.naturalWidth, height: image.naturalHeight, error: '' });
      } catch (error) {
        results.push({ id: item.id, width: 0, height: 0, error: String(error) });
      } finally { URL.revokeObjectURL(url); }
    }
    return results;
  });
  expect(thumbnails.length).toBeGreaterThanOrEqual(100);
  expect(thumbnails.filter(thumbnail => thumbnail.error)).toEqual([]);
  for (const thumbnail of thumbnails) {
    expect(thumbnail.width, thumbnail.id).toBeGreaterThan(100);
    expect(thumbnail.height, thumbnail.id).toBeGreaterThan(100);
  }
});

test('every advertised coloring region has visible, reachable pixels at source resolution', async ({ page }) => {
  await page.goto('/tests/harness.html');
  const result = await page.evaluate(async () => {
    const catalog = await (await fetch('/art/catalog.json')).json();
    const hidden: string[] = [];
    let regionsChecked = 0;
    for (const meta of catalog) {
      const art = await (await fetch(`/art/${meta.id}.json`)).json();
      const canvas = document.createElement('canvas'); canvas.width = art.width; canvas.height = art.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const colors = new Map<number, number>();
      for (let i = 0; i < art.regions.length; i++) {
        const color = (i + 1) * 1771;
        colors.set(color, i);
        ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
        ctx.fill(new Path2D(art.regions[i].path));
      }
      const counts = new Uint32Array(art.regions.length);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      for (let p = 0; p < pixels.length; p += 4) {
        if (pixels[p + 3] !== 255) continue;
        const index = colors.get((pixels[p] << 16) | (pixels[p + 1] << 8) | pixels[p + 2]);
        if (index !== undefined) counts[index]++;
      }
      for (let i = 0; i < counts.length; i++) {
        if (counts[i] < 3) hidden.push(`${meta.id}/${art.regions[i].id}: ${counts[i]} visible pixels`);
      }
      regionsChecked += counts.length;
      canvas.width = 1; canvas.height = 1;
    }
    return { hidden, regionsChecked };
  });
  expect(result.hidden).toEqual([]);
  expect(result.regionsChecked).toBeGreaterThan(1000);
});
