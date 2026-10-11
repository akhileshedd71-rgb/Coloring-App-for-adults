import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function studio(page: Page) {
  await page.goto('/');
  await expect(page.locator('.art-card').first()).toBeVisible();
}
async function openPortrait(page: Page) {
  await studio(page);
  await page.locator('[data-action="open-art"][data-id="portrait-01"]').first().click();
  await expect(page.locator('.painting-canvas')).toBeVisible();
}
async function paintAt(page: Page, x = 384, y = 410) {
  const canvas = page.locator('.painting-canvas');
  const box = (await canvas.boundingBox())!;
  const scale = Math.min((box.width - 24) / 768, (box.height - 24) / 1024);
  await page.mouse.click(box.x + (box.width - 768 * scale) / 2 + x * scale, box.y + (box.height - 1024 * scale) / 2 + y * scale);
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
}
const stored = (page: Page) => page.evaluate(async () => {
  const storage = await import('/src/storage.ts');
  const rows = await storage.listDocuments();
  return Promise.all(rows.map(row => storage.getDocument(row.id)));
});

test('search, category, difficulty and illustration favorites work together', async ({ page }) => {
  await studio(page);
  expect(await page.locator('.art-card').count()).toBeGreaterThanOrEqual(100);
  await page.locator('#search').fill('Braided Reverie');
  await expect(page.locator('.art-card')).toHaveCount(1);
  await page.locator('#difficulty').selectOption('Easy');
  await expect(page.locator('.art-card')).toHaveCount(0);
  await page.locator('[data-action="clear-filters"]').click();
  await page.locator('[data-category="Hair Stories"]').click();
  await expect(page.locator('.art-card')).toHaveCount(12);
  const favorite = page.locator('[data-action="favorite"]').first();
  await favorite.click();
  await expect(favorite).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-action="navigate"][data-view="favorites"]:visible').first().click();
  await expect(page.locator('.art-card')).toHaveCount(1);
  await page.reload();
  const prefs = await page.evaluate(async () => (await import('/src/storage.ts')).getPreferences());
  expect(prefs.favorites).toHaveLength(1);
});

test('actual painting autosaves, undo/redo persists, and reopening restores identical pixels', async ({ page }) => {
  await openPortrait(page);
  await paintAt(page);
  expect((await stored(page))[0]?.commands).toHaveLength(1);
  await page.locator('[data-action="undo"]').click();
  await expect.poll(async () => (await stored(page))[0]?.commands.length).toBe(0);
  await page.locator('[data-action="redo"]').click();
  await expect.poll(async () => (await stored(page))[0]?.commands.length).toBe(1);
  await page.waitForTimeout(350);
  const before = await page.locator('canvas').evaluate((el: HTMLCanvasElement) => el.toDataURL());
  const commands = (await stored(page))[0]?.commands;
  await page.reload();
  await page.locator('.continue-section [data-action="open-doc"]').first().click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(350);
  const after = await page.locator('canvas').evaluate((el: HTMLCanvasElement) => el.toDataURL());
  expect(after).toBe(before);
  expect((await stored(page))[0]?.commands).toEqual(commands);
});

test('all brush controls, HEX colors, custom palettes and region locking are reachable', async ({ page }) => {
  await openPortrait(page);
  await paintAt(page);
  await page.locator('[data-action="tools"]').click();
  await expect(page.locator('.all-tools [data-tool]')).toHaveCount(8);
  await page.locator('.all-tools [data-tool="texture"]').click();
  await page.locator('#brush-size').fill('48');
  await page.locator('#brush-opacity').fill('65');
  await page.locator('[data-action="lock-region"]').click();
  await expect(page.locator('[data-action="lock-region"]')).toHaveAttribute('aria-checked', 'true');
  await page.locator('.sheet-header [data-action="close-dialog"]').click();
  await page.locator('[data-action="colors"]').first().click();
  await page.locator('#hex-color').fill('#AA5577');
  await page.locator('[data-action="apply-hex"]').click();
  await page.locator('[data-action="save-swatch"]').click();
  await page.locator('[data-action="new-palette"]').click();
  await page.locator('#name-input').fill('Portrait shadows');
  await page.locator('#name-form button[type="submit"]').click();
  await expect(page.locator('.custom-palette')).toContainText('Portrait shadows');
  await page.locator('.sheet-header [data-action="close-dialog"]').click();
  await paintAt(page, 384, 425);
  const doc = (await stored(page))[0]!;
  const mark = doc.commands.at(-1)!;
  expect(mark.tool).toBe('texture');
  expect(mark.color).toBe('#AA5577');
  expect(mark.size).toBe(48);
  expect(mark.opacity).toBe(.65);
  expect(mark.regionId).toBe(doc.commands[0].regionId);
  const prefs = await page.evaluate(async () => (await import('/src/storage.ts')).getPreferences());
  expect(prefs.customPalettes[0].colors).toContain('#AA5577');
});

test('gallery rename, duplicate, favorites and confirmed delete preserve original work', async ({ page }) => {
  await openPortrait(page); await paintAt(page);
  await page.locator('[data-action="back"]').click();
  await page.locator('[data-action="navigate"][data-view="gallery"]:visible').first().click();
  await page.locator('[data-action="doc-menu"]').first().click();
  await page.locator('[data-doc-action="rename"]').click();
  await page.locator('#name-input').fill('My Sunday muse');
  await page.locator('#name-form button[type="submit"]').click();
  await expect(page.locator('.gallery-grid').first()).toContainText('My Sunday muse');
  await page.locator('[data-action="doc-menu"]').first().click();
  await page.locator('[data-doc-action="duplicate"]').click();
  await expect(page.locator('.gallery-grid').first().locator('.work-card')).toHaveCount(2);
  await page.locator('[data-action="doc-menu"]').first().click();
  await page.locator('[data-doc-action="favorite"]').click();
  expect((await stored(page)).filter(d => d?.favorite)).toHaveLength(1);
  await page.locator('[data-action="doc-menu"]').first().click();
  await page.locator('[data-doc-action="delete"]').click();
  await expect(page.locator('#confirm-action')).toBeVisible();
  expect(await stored(page)).toHaveLength(2);
  await page.locator('#confirm-action').click();
  await expect.poll(async () => (await stored(page)).length).toBe(1);
  expect((await stored(page))[0]?.commands).toHaveLength(1);
});

test('PNG and JPEG downloads contain full resolution artwork', async ({ page }) => {
  await openPortrait(page); await paintAt(page);
  for (const format of ['png', 'jpeg']) {
    await page.locator('[data-action="export-menu"]').click();
    const downloadEvent = page.waitForEvent('download');
    await page.locator(`[data-action="export-${format}"]`).click();
    const download = await downloadEvent;
    const bytes = await readFile((await download.path())!);
    expect(bytes.length).toBeGreaterThan(10000);
    const dimensions = await page.evaluate(async ({ data, type }) => {
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type }));
      const result = { width: bitmap.width, height: bitmap.height }; bitmap.close(); return result;
    }, { data: bytes.toString('base64'), type: `image/${format}` });
    expect(dimensions).toEqual({ width: 2304, height: 3072 });
  }
});

test('theme, reduced motion, completion and reset retain an editable original', async ({ page }) => {
  await studio(page);
  await page.locator('[data-action="settings"]').click();
  await page.locator('[data-theme="dark"]').click();
  await page.locator('[data-action="reduced-motion"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveClass(/reduce-motion/);
  await page.locator('.sheet-header [data-action="close-dialog"]').click();
  await page.locator('[data-action="open-art"][data-id="portrait-01"]').first().click();
  await paintAt(page);
  await page.locator('[data-action="editor-menu"]').click();
  await page.locator('[data-action="celebrate"]').click();
  await expect(page.locator('#dialog-title')).toContainText('masterpiece');
  await page.locator('.sheet-header [data-action="close-dialog"]').click();
  await page.locator('[data-action="editor-menu"]').click();
  await page.locator('[data-action="reset"]').click();
  expect((await stored(page))[0]?.commands).toHaveLength(1);
  await page.locator('#confirm-action').click();
  await expect.poll(async () => (await stored(page))[0]?.commands.length).toBe(0);
  expect((await stored(page))[0]?.artworkSnapshot?.regions.length).toBeGreaterThan(5);
});

test('failed artwork loads recover and storage failure keeps unsaved drawing open for retry', async ({ page }) => {
  await studio(page);
  await page.route('**/art/portrait-01.json', route => route.fulfill({ status: 503, body: 'temporarily unavailable' }));
  await page.locator('[data-action="open-art"][data-id="portrait-01"]').first().click();
  await expect(page.locator('.toast')).toContainText('could not load');
  await expect(page.locator('#art-grid')).toBeVisible();
  await page.unroute('**/art/portrait-01.json');
  await page.locator('[data-action="open-art"][data-id="portrait-01"]').first().click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.evaluate(() => {
    const real = IDBDatabase.prototype.transaction;
    (window as any).restoreTransaction = () => { IDBDatabase.prototype.transaction = real; };
    IDBDatabase.prototype.transaction = function (...args: any[]) {
      if (args[1] === 'readwrite') throw new DOMException('Storage is full', 'QuotaExceededError');
      return real.apply(this, args as any);
    } as any;
  });
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator('#save-status')).toContainText('Save failed');
  await page.locator('[data-action="back"]').click();
  await expect(page.locator('canvas')).toBeVisible();
  await page.evaluate(() => (window as any).restoreTransaction());
  await page.locator('#save-status').click();
  await expect(page.locator('#save-status')).toHaveText('Saved on this device');
  expect((await stored(page))[0]?.commands).toHaveLength(1);
});

test('phone, tablet and landscape layouts keep the canvas and essential tools usable', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openPortrait(page);
  for (const size of [{ width: 360, height: 800 }, { width: 800, height: 1280 }, { width: 1280, height: 800 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size);
    await expect(page.locator('[data-action="tool"][data-tool="fill"]')).toBeVisible();
    await expect(page.locator('[data-action="tools"]')).toBeVisible();
    const bounds = (await page.locator('canvas').boundingBox())!;
    expect(bounds.width).toBeGreaterThan(250);
    expect(bounds.height).toBeGreaterThan(240);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(size.width + 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow, JSON.stringify(size)).toBe(false);
  }
  expect(errors).toEqual([]);
});
