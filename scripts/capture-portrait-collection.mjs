import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const output = new URL('../docs/screenshots/', import.meta.url).pathname;
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
await page.goto(process.env.STUDIO_URL || 'http://127.0.0.1:5173');
await page.locator('[data-category="Portrait Atelier"]').click();
await page.locator('.art-card').first().waitFor();
await page.locator('.library-section').scrollIntoViewIfNeeded();
await page.locator('.art-grid img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
await page.screenshot({ path: `${output}/phone-portrait-atelier.png` });
// Keep every card in the viewport so Chromium paints all backdrop-filter controls.
await page.setViewportSize({ width: 1280, height: 2100 });
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(200);
await page.screenshot({ path: `${output}/tablet-portrait-atelier.png`, fullPage: true });
await page.setViewportSize({ width: 412, height: 915 });
await page.locator('[data-action="open-art"][data-id="atelier-moonlit-couture-v1"]').first().click();
await page.locator('.painting-canvas').waitFor();
await page.waitForTimeout(400);
await page.screenshot({ path: `${output}/phone-atelier-canvas.png` });
const sourceDirectory = new URL('../artwork-sources/portrait-collection/', import.meta.url);
const review = JSON.parse(await fs.readFile(new URL('boundary-review.json', sourceDirectory), 'utf8')).drawings.find(drawing => drawing.id === 'atelier-moonlit-couture-v1');
const transform = JSON.parse(await fs.readFile(new URL('compilation-report.json', sourceDirectory), 'utf8')).drawings.find(drawing => drawing.id === review.id);
const logical = point => [point[0] * (transform.sourceWidth - 1) * transform.sourceScale + transform.artworkOffsetX, point[1] * (transform.sourceHeight - 1) * transform.sourceScale + transform.artworkOffsetY];
async function fill(color, point) {
  await page.locator('[data-action="colors"]').first().click();
  await page.locator('#hex-color').fill(color);
  await page.locator('[data-action="apply-hex"]').click();
  await page.locator('.sheet-header [data-action="close-dialog"]').click();
  const box = await page.locator('.painting-canvas').boundingBox();
  const scale = Math.min((box.width - 24) / 768, (box.height - 24) / 1024);
  await page.mouse.click(box.x + (box.width - 768 * scale) / 2 + point[0] * scale, box.y + (box.height - 1024 * scale) / 2 + point[1] * scale);
  await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved on this device');
  await page.waitForTimeout(300);
}
await fill('#DCA37B', logical(review.face));
await fill('#DCA37B', [384, 540]);
for (const lip of review.lips || (review.lip ? [review.lip] : [])) await fill('#C87585', logical(lip));
await fill('#C4B9EF', logical(review.garment));
await fill('#FFF5ED', logical(review.background));
await page.screenshot({ path: `${output}/phone-atelier-coloring.png` });
await browser.close();
console.log('Saved actual Portrait Atelier library and canvas screenshots.');
