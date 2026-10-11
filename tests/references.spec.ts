import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ArtworkMeta } from '../src/types';

const collection = async () => (JSON.parse(await readFile('public/art/catalog.json', 'utf8')) as ArtworkMeta[]).filter(art => art.category === 'Floral Reverie');
const saved = (page: Page) => page.evaluate(async () => {
  const storage = await import('/src/storage.ts');
  const docs = await storage.listDocuments();
  return Promise.all(docs.map(doc => storage.getDocument(doc.id)));
});
async function open(page: Page, art: ArtworkMeta) {
  await page.locator(`[data-action="open-art"][data-id="${art.id}"]`).first().click();
  await expect(page.locator('.painting-canvas')).toBeVisible();
}
async function referenceReady(page: Page, art: ArtworkMeta, pinned = false) {
  const slot = page.locator(pinned ? '.reference-dock .reference-image-slot' : '#reference-large');
  await expect(slot).toHaveAttribute('data-state', 'ready');
  await expect(slot.locator('img')).toHaveAttribute('src', art.referenceImage!);
  await expect(slot.locator('img')).toHaveAttribute('alt', `Colored inspiration for ${art.title}`);
  expect(await slot.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThanOrEqual(768);
}
async function paintUncoveredRegion(page: Page, art: ArtworkMeta) {
  // Select a genuinely fillable point without relying on this collection's faces or flowers.
  const point = await page.evaluate(async id => {
    const art = await (await fetch(`/art/${id}.json`)).json();
    const rect = document.querySelector('canvas')!.getBoundingClientRect();
    const scale = Math.min((rect.width - 24) / art.width, (rect.height - 24) / art.height);
    const ctx = document.createElement('canvas').getContext('2d')!;
    const paths = art.regions.map((region: { path: string }) => new Path2D(region.path));
    for (let y = art.height * .4; y < art.height * .85; y += 13) for (let x = art.width * .25; x < art.width * .8; x += 13) {
      const screenX = rect.left + (rect.width - art.width * scale) / 2 + x * scale;
      const screenY = rect.top + (rect.height - art.height * scale) / 2 + y * scale;
      if (document.elementFromPoint(screenX, screenY)?.tagName !== 'CANVAS') continue;
      if (paths.some((path: Path2D) => [[0, 0], [-3, 0], [3, 0], [0, -3], [0, 3]].every(([dx, dy]) => ctx.isPointInPath(path, x + dx, y + dy)))) return { x: screenX, y: screenY };
    }
    throw new Error('No uncovered coloring region found');
  }, art.id);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
}

test('all six floral pages expose their matching local references only on demand', async ({ page }) => {
  const additions = await collection(); expect(additions).toHaveLength(6);
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/references/')) requests.push(new URL(request.url()).pathname); });
  await page.goto('/');
  await expect(page.locator('.art-card').first()).toBeVisible();
  expect(requests).toEqual([]);
  await page.locator('[data-action="open-art"][data-id="portrait-01"]').first().click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.reference-open')).toHaveCount(0);
  await page.locator('[data-action="back"]').click();
  for (const art of additions) {
    const before = requests.length;
    await open(page, art);
    expect(requests).toHaveLength(before);
    await page.getByRole('button', { name: 'Open colored reference', exact: true }).click();
    await referenceReady(page, art);
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Color inspiration');
    expect(await page.locator('#app').evaluate((el: HTMLElement) => el.inert)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.locator('.dialog-backdrop')).toHaveCount(0);
    await expect(page.locator('.reference-open')).toBeFocused();
    await page.locator('[data-action="back"]').click();
  }
  expect([...new Set(requests)].sort()).toEqual(additions.map(art => art.referenceImage!).sort());
});

test('a pinned reference blocks paint-through, permits coloring, and reopens beside saved artwork', async ({ page }) => {
  const art = (await collection())[0];
  await page.goto('/'); await open(page, art);
  const unpainted = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.locator('.reference-open').click();
  await referenceReady(page, art);
  await page.getByRole('button', { name: 'Keep beside canvas' }).click();
  await referenceReady(page, art, true);
  expect(await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(unpainted);
  const img = page.locator('.reference-dock img');
  await img.click();
  const box = (await img.boundingBox())!;
  await page.mouse.move(box.x + 15, box.y + 20); await page.mouse.down();
  await page.mouse.move(box.x - 70, box.y + box.height + 25, { steps: 12 }); await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await paintUncoveredRegion(page, art);
  const commands = (await saved(page))[0]!.commands;
  expect(commands).toHaveLength(1);
  await page.getByRole('button', { name: 'Move reference to the left' }).click();
  await expect(page.locator('.reference-dock')).toHaveClass(/reference-left/);
  await page.getByRole('button', { name: 'Enlarge reference' }).click();
  await referenceReady(page, art);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Enlarge reference' })).toBeFocused();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await saved(page))[0]?.commands.length).toBe(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect.poll(async () => (await saved(page))[0]?.commands).toEqual(commands);
  await page.reload();
  await page.locator('.continue-section [data-action="open-doc"]').first().click();
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.reference-dock')).toHaveCount(0);
  await page.locator('.reference-open').click();
  await referenceReady(page, art);
  expect((await saved(page))[0]?.commands).toEqual(commands);
});

test('missing references retry safely, and a late load cannot replace another drawing’s reference', async ({ page }) => {
  const [first, second] = await collection();
  let fail = true;
  await page.route(`**${first.referenceImage}`, route => fail ? route.fulfill({ status: 404, body: 'missing' }) : route.continue());
  await page.goto('/'); await open(page, first); await page.locator('.reference-open').click();
  await expect(page.locator('#reference-large')).toHaveAttribute('data-state', 'error');
  await expect(page.locator('#reference-large')).toContainText('Your coloring is safe');
  fail = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await referenceReady(page, first);
  await page.keyboard.press('Escape');
  await page.unroute(`**${first.referenceImage}`);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${first.referenceImage}`, async route => { await held; await route.continue().catch(() => {}); });
  await page.locator('.reference-open').click();
  await expect(page.locator('#reference-large')).toHaveAttribute('data-state', 'loading');
  await page.keyboard.press('Escape'); await page.locator('[data-action="back"]').click();
  await open(page, second); await page.locator('.reference-open').click();
  await referenceReady(page, second);
  release();
  await expect(page.locator('#reference-large img')).toHaveAttribute('src', second.referenceImage!);
  await expect(page.locator('.reference-dock')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await paintUncoveredRegion(page, second);
  expect((await saved(page)).find(doc => doc?.artworkId === second.id)?.commands).toHaveLength(1);
});

test('the Android back callback closes the enlarged and pinned references before leaving a painting', async ({ page }) => {
  // Exercise callback ordering, not physical Android event delivery.
  await page.route('**/src/native.ts', route => route.fulfill({ contentType: 'application/javascript', body: 'export async function initNative(onBack) { window.referenceTestBack = onBack; } export async function shareImage() {}' }));
  const art = (await collection())[0];
  await page.goto('/'); await open(page, art);
  await page.locator('.reference-open').click(); await referenceReady(page, art);
  await page.getByRole('button', { name: 'Keep beside canvas' }).click();
  await page.getByRole('button', { name: 'Enlarge reference' }).click();
  expect(await page.evaluate(() => (window as any).referenceTestBack())).toBe(true);
  await expect(page.locator('.dialog-backdrop')).toHaveCount(0);
  await expect(page.locator('.reference-dock')).toBeVisible();
  expect(await page.evaluate(() => (window as any).referenceTestBack())).toBe(true);
  await expect(page.locator('.reference-dock')).toHaveCount(0);
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('.reference-open')).toBeFocused();
  expect(await page.evaluate(() => (window as any).referenceTestBack())).toBe(true);
  await expect(page.locator('#art-grid')).toBeVisible();
});

test('references fit small phones, tablets and landscape in dark and reduced-motion modes', async ({ page }) => {
  const art = (await collection())[0];
  await page.goto('/');
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-theme="dark"]').click();
  await page.locator('[data-action="reduced-motion"]').click();
  await page.keyboard.press('Escape'); await open(page, art);
  for (const size of [{ width: 360, height: 800 }, { width: 800, height: 1280 }, { width: 1280, height: 800 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await page.locator('.reference-open').click(); await referenceReady(page, art);
    const sheet = (await page.getByRole('dialog').boundingBox())!;
    expect(sheet.x).toBeGreaterThanOrEqual(0); expect(sheet.y).toBeGreaterThanOrEqual(0);
    expect(sheet.x + sheet.width).toBeLessThanOrEqual(size.width + 1); expect(sheet.y + sheet.height).toBeLessThanOrEqual(size.height + 1);
    await page.getByRole('button', { name: 'Keep beside canvas' }).click(); await referenceReady(page, art, true);
    const dock = (await page.locator('.reference-dock').boundingBox())!, canvas = (await page.locator('canvas').boundingBox())!;
    expect(dock.width).toBeGreaterThanOrEqual(130); expect(dock.height).toBeGreaterThan(105);
    expect(dock.x).toBeGreaterThanOrEqual(canvas.x); expect(dock.x + dock.width).toBeLessThanOrEqual(canvas.x + canvas.width);
    expect(dock.y).toBeGreaterThanOrEqual(canvas.y); expect(dock.y + dock.height).toBeLessThanOrEqual(canvas.y + canvas.height - 35);
    await expect(page.locator('[data-action="tools"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await page.getByRole('button', { name: 'Hide reference' }).click();
  }
});
