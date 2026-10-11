import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const output = new URL('../docs/screenshots/', import.meta.url).pathname;
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
await page.goto(process.env.STUDIO_URL || 'http://127.0.0.1:5173');
await page.locator('[data-category="Dreamlight Portraits"]').click();
await page.locator('.art-grid img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
await page.locator('.library-section').scrollIntoViewIfNeeded();
await page.screenshot({ path: `${output}/phone-dreamlight-portraits.png` });
// A tall viewport also paints every translucent favorite control before capture.
await page.setViewportSize({ width: 1280, height: 1800 });
await page.mouse.move(0, 0);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(250);
await page.screenshot({ path: `${output}/tablet-dreamlight-portraits.png`, fullPage: true });
await page.setViewportSize({ width: 412, height: 915 });
await page.locator('[data-action="open-art"][data-id="dreamlight-rosewood-rambler-v1"]').first().click();
await page.locator('.painting-canvas').waitFor();
await page.waitForTimeout(300);
await page.locator('.reference-open').click();
await page.locator('#reference-large[data-state="ready"]').waitFor();
await page.waitForTimeout(250);
await page.screenshot({ path: `${output}/dreamlight-phone-colored-reference.png` });
await page.locator('[data-action="reference-pin"]').click();
await page.locator('.reference-dock [data-state="ready"]').waitFor();

// Add one real, saved skin fill while the reference remains beside the canvas.
const sourceDirectory = new URL('../artwork-sources/dreamlight-portraits/', import.meta.url);
const review = JSON.parse(await fs.readFile(new URL('boundary-review.json', sourceDirectory), 'utf8')).drawings.find(drawing => drawing.id === 'dreamlight-rosewood-rambler-v1');
const transform = JSON.parse(await fs.readFile(new URL('compilation-report.json', sourceDirectory), 'utf8')).drawings.find(drawing => drawing.id === review.id);
const point = [review.face[0] * (transform.sourceWidth - 1) * transform.sourceScale + transform.artworkOffsetX, review.face[1] * (transform.sourceHeight - 1) * transform.sourceScale + transform.artworkOffsetY];
const box = await page.locator('.painting-canvas').boundingBox();
const scale = Math.min((box.width - 24) / 768, (box.height - 24) / 1024);
await page.mouse.click(box.x + (box.width - 768 * scale) / 2 + point[0] * scale, box.y + (box.height - 1024 * scale) / 2 + point[1] * scale);
await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved on this device');
await page.waitForTimeout(250);
await page.screenshot({ path: `${output}/dreamlight-phone-reference-pinned.png` });
await page.setViewportSize({ width: 800, height: 1280 });
await page.waitForTimeout(250);
await page.screenshot({ path: `${output}/dreamlight-tablet-reference-pinned.png` });
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(250);
await page.screenshot({ path: `${output}/dreamlight-landscape-reference.png` });
await browser.close();
console.log('Saved actual Dreamlight Portraits library and colored-reference screenshots.');
