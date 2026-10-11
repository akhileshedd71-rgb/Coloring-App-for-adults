import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const output = new URL('../docs/screenshots/', import.meta.url).pathname;
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
  await page.goto(process.env.STUDIO_URL || 'http://127.0.0.1:5173');
  await page.locator('[data-category="Quiet Moments"]').click();
  await page.locator('.art-grid img').evaluateAll(images => Promise.all(images.map(image => {
    image.loading = 'eager';
    return image.decode();
  })));
  await page.locator('.library-section').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/phone-quiet-moments.png` });
  await page.setViewportSize({ width: 1280, height: 1800 });
  await page.mouse.move(0, 0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/tablet-quiet-moments.png`, fullPage: true });

  await page.setViewportSize({ width: 412, height: 915 });
  await page.locator('[data-action="open-art"][data-id="quiet-ginkgo-grace-v1"]').first().click();
  await page.locator('.painting-canvas').waitFor();
  const directory = new URL('../artwork-sources/quiet-moments/', import.meta.url);
  const review = JSON.parse(await fs.readFile(new URL('boundary-review.json', directory), 'utf8')).drawings[0];
  const transform = JSON.parse(await fs.readFile(new URL('compilation-report.json', directory), 'utf8')).drawings[0];
  const x = review.face[0] * (transform.sourceWidth - 1) * transform.sourceScale + transform.artworkOffsetX;
  const y = review.face[1] * (transform.sourceHeight - 1) * transform.sourceScale + transform.artworkOffsetY;
  const box = await page.locator('.painting-canvas').boundingBox();
  const scale = Math.min((box.width - 24) / 768, (box.height - 24) / 1024);
  await page.mouse.click(box.x + (box.width - 768 * scale) / 2 + x * scale, box.y + (box.height - 1024 * scale) / 2 + y * scale);
  await page.waitForFunction(() => document.querySelector('#save-status')?.textContent === 'Saved on this device');
  await page.screenshot({ path: `${output}/quiet-moments-phone-painting.png` });
} finally {
  await browser.close();
}
console.log('Saved Quiet Moments library and actual saved-painting screenshots.');
