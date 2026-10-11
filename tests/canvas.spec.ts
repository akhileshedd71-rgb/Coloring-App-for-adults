import { test, expect, type Page } from '@playwright/test';
import type { CanvasSettings, Artwork } from '../src/types';

// Overlapping shapes model a face, eye and iris. Their simple geometry makes
// boundary expectations independent of the painting implementation.
const artwork: Artwork = {
  id: 'boundary-fixture', width: 300, height: 400,
  regions: [
    { id: 'face', path: 'M30 30H270V370H30Z' },
    { id: 'eye', path: 'M120 90H180V150H120Z' },
    { id: 'iris', path: 'M135 110H165V140H135Z' },
  ],
  lines: [{ path: 'M55 320Q150 300 245 320', width: 2 }],
};

async function createStudio(page: Page) {
  await page.goto('/tests/harness.html');
  await page.evaluate(async art => {
    const { PaintingCanvas } = await import('/src/canvas.ts');
    const w = window as any;
    w.testChanges = []; w.testColors = []; w.testHistory = []; w.testZooms = [];
    w.testArtwork = art;
    w.testEngine = new PaintingCanvas(document.querySelector('#studio')!, art, [], {
      onChange: commands => w.testChanges.push(commands),
      onPickColor: color => w.testColors.push(color),
      onHistory: (undo, redo) => w.testHistory.push([undo, redo]),
      onZoom: zoom => w.testZooms.push(zoom),
    });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, artwork);
}

async function settings(page: Page, values: Partial<CanvasSettings>) {
  await page.evaluate(values => (window as any).testEngine.setSettings(values), values);
}

async function position(page: Page, x: number, y: number) {
  // Only placement reads the transform. All assertions examine public commands
  // or exported pixels, rather than private renderer state.
  return page.evaluate(({ x, y }) => {
    const engine = (window as any).testEngine;
    const rect = engine.element.getBoundingClientRect();
    return { x: rect.left + engine.offset.x + x * engine.scale, y: rect.top + engine.offset.y + y * engine.scale };
  }, { x, y });
}

async function tap(page: Page, x: number, y: number) {
  const point = await position(page, x, y); await page.mouse.click(point.x, point.y);
}

async function stroke(page: Page, from: [number, number], to: [number, number], steps = 12) {
  const a = await position(page, ...from), b = await position(page, ...to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps }); await page.mouse.up();
}

async function pixels(page: Page, coordinates: [number, number][]) {
  return page.evaluate(async coordinates => {
    const blob = await (window as any).testEngine.exportImage('png', 2);
    const image = await createImageBitmap(blob);
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
    const result = coordinates.map(([x, y]) => [...ctx.getImageData(Math.round(x * 2), Math.round(y * 2), 1, 1).data]);
    image.close(); return result;
  }, coordinates);
}

async function commandCount(page: Page) { return page.evaluate(() => (window as any).testEngine.getCommands().length); }
const white = [255, 255, 255, 255];

test.beforeEach(async ({ page }) => createStudio(page));

test('tap fill respects nested regions and supports undo, redo, color picking and reset', async ({ page }) => {
  await settings(page, { tool: 'fill', color: '#e06070' });
  await tap(page, 70, 70);
  expect(await commandCount(page)).toBe(1);
  expect(await pixels(page, [[70, 70], [10, 70], [125, 100], [150, 120]])).toEqual([[224, 96, 112, 255], white, white, white]);
  await settings(page, { color: '#5078b0' }); await tap(page, 150, 120);
  expect((await pixels(page, [[150, 120]]))[0]).toEqual([80, 120, 176, 255]);
  await page.evaluate(() => (window as any).testEngine.undo());
  expect((await pixels(page, [[150, 120]]))[0]).toEqual(white);
  await page.evaluate(() => (window as any).testEngine.redo());
  expect((await pixels(page, [[150, 120]]))[0]).toEqual([80, 120, 176, 255]);
  await settings(page, { tool: 'eyedropper' }); await tap(page, 70, 70);
  expect(await page.evaluate(() => (window as any).testColors.at(-1))).toBe('#e06070');
  expect(await commandCount(page)).toBe(2);
  await page.evaluate(() => (window as any).testEngine.reset());
  expect(await commandCount(page)).toBe(0);
  expect((await pixels(page, [[70, 70], [150, 120]])).every(pixel => JSON.stringify(pixel) === JSON.stringify(white))).toBe(true);
});

test('guided brush and explicit region lock protect eye and iris overlap boundaries', async ({ page }) => {
  await settings(page, { tool: 'brush', color: '#2e5262', size: 70, opacity: 1, guided: true });
  await stroke(page, [50, 120], [290, 120]);
  const sample = await pixels(page, [[80, 120], [210, 120], [125, 120], [150, 120], [280, 120]]);
  expect(sample).toEqual([[46, 82, 98, 255], [46, 82, 98, 255], white, white, white]);
  await page.evaluate(() => { (window as any).testEngine.reset(); (window as any).testEngine.lockRegion('face'); });
  await stroke(page, [150, 120], [240, 120]);
  const locked = await pixels(page, [[150, 120], [210, 120]]);
  expect(locked).toEqual([white, [46, 82, 98, 255]]);
  expect(await page.evaluate(() => (window as any).testEngine.getCommands()[0].regionId)).toBe('face');
});

test('free brush crosses regions, opacity blends, and airbrush has a soft falloff', async ({ page }) => {
  await settings(page, { tool: 'brush', color: '#000000', size: 30, opacity: 0.5, guided: false });
  await stroke(page, [10, 250], [290, 250]);
  const blended = await pixels(page, [[15, 250], [80, 250]]);
  for (const pixel of blended) { expect(pixel[0]).toBeGreaterThan(120); expect(pixel[0]).toBeLessThan(135); }
  await settings(page, { tool: 'airbrush', size: 45, opacity: 1, guided: true });
  await stroke(page, [70, 205], [110, 205]);
  const soft = await pixels(page, [[90, 205], [90, 225], [90, 160], [10, 205]]);
  expect(soft[0][0]).toBeLessThan(soft[1][0]);
  expect(soft[1][0]).toBeLessThan(255);
  expect(soft[2]).toEqual(white);
  expect(soft[3]).toEqual(white);
});

test('gradient follows the dragged direction and preserves outlines and excluded regions', async ({ page }) => {
  await settings(page, { tool: 'gradient', color: '#ff0000', secondaryColor: '#0000ff', opacity: 1, guided: true });
  await stroke(page, [60, 230], [240, 230]);
  const [left, right, outside, eye, line] = await pixels(page, [[70, 230], [230, 230], [10, 230], [150, 120], [30, 230]]);
  expect(left[0]).toBeGreaterThan(220); expect(left[2]).toBeLessThan(35);
  expect(right[2]).toBeGreaterThan(220); expect(right[0]).toBeLessThan(35);
  expect(outside).toEqual(white); expect(eye).toEqual(white);
  expect(Math.max(...line.slice(0, 3))).toBeLessThan(150);
});

test('eraser removes paint while leaving original line work intact', async ({ page }) => {
  await settings(page, { tool: 'fill', color: '#e06070' }); await tap(page, 70, 70);
  await settings(page, { tool: 'eraser', size: 75, guided: false });
  await stroke(page, [10, 310], [290, 310]);
  const [erased, untouched, outline] = await pixels(page, [[80, 300], [80, 270], [150, 310]]);
  expect(erased).toEqual(white); expect(untouched).toEqual([224, 96, 112, 255]);
  expect(Math.max(...outline.slice(0, 3))).toBeLessThan(150);
  await page.evaluate(() => (window as any).testEngine.undo());
  expect((await pixels(page, [[80, 300]]))[0]).toEqual([224, 96, 112, 255]);
});

test('a foreground shape hides earlier outline segments in both canvas and export', async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as any;
    w.testEngine.destroy();
    const art = structuredClone(w.testArtwork);
    art.regions.push({ id: 'foreground-sleeve', path: 'M10 200H60V300H10Z' });
    const { PaintingCanvas } = await import('/src/canvas.ts');
    w.testEngine = new PaintingCanvas(document.querySelector('#studio')!, art, [], { onChange: () => {} });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const [hidden, visible] = await pixels(page, [[30, 250], [30, 180]]);
  expect(hidden).toEqual(white);
  expect(Math.max(...visible.slice(0, 3))).toBeLessThan(150);
  const point = await position(page, 30, 250);
  const displayed = await page.evaluate(({ x, y }) => {
    const canvas = (window as any).testEngine.element as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    return [...canvas.getContext('2d')!.getImageData(Math.round((x - rect.left) * canvas.width / rect.width), Math.round((y - rect.top) * canvas.height / rect.height), 1, 1).data];
  }, point);
  expect(displayed).toEqual(white);
});

test('filled vector ink stays crisp and width zero adds no unwanted outline', async ({ page }) => {
  await page.evaluate(async () => {
    const w = window as any;
    w.testEngine.destroy();
    const art = structuredClone(w.testArtwork);
    art.lines.push({ path: 'M70 200H100V250H70Z', fill: '#30252d', width: 0 });
    const { PaintingCanvas } = await import('/src/canvas.ts');
    w.testEngine = new PaintingCanvas(document.querySelector('#studio')!, art, [], { onChange: () => {} });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  const [inside, beside] = await pixels(page, [[85, 225], [69.25, 225]]);
  expect(inside).toEqual([48, 37, 45, 255]);
  expect(beside).toEqual(white);
  await settings(page, { tool: 'fill', color: '#e06070' }); await tap(page, 60, 220);
  expect((await pixels(page, [[85, 225]]))[0]).toEqual([48, 37, 45, 255]);
});

test('zoomed pointer coordinates stay accurate and Fit restores the page', async ({ page }) => {
  await page.evaluate(() => (window as any).testEngine.zoomBy(3));
  await settings(page, { tool: 'brush', color: '#ff0000', size: 8, guided: false });
  await tap(page, 155, 205);
  const command = await page.evaluate(() => (window as any).testEngine.getCommands()[0]);
  expect(command.points[0].x).toBeCloseTo(155, 0); expect(command.points[0].y).toBeCloseTo(205, 0);
  const [center, away] = await pixels(page, [[155, 205], [160, 205]]);
  expect(center).toEqual([255, 0, 0, 255]); expect(away).toEqual(white);
  await page.evaluate(() => (window as any).testEngine.fit());
  expect(await page.evaluate(() => (window as any).testZooms.at(-1))).toBe(1);
});

test('two-finger pinch cancels tentative paint, zooms, pans and leaves no stray dot', async ({ page }) => {
  await settings(page, { tool: 'brush', color: '#000000', size: 30 });
  const client = await page.context().newCDPSession(page);
  const touch = async (type: string, points: { x: number; y: number; id: number }[]) => client.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [{ x: 100, y: 240, id: 1 }]);
  await touch('touchStart', [{ x: 100, y: 240, id: 1 }, { x: 240, y: 240, id: 2 }]);
  await touch('touchMove', [{ x: 70, y: 260, id: 1 }, { x: 300, y: 260, id: 2 }]);
  await touch('touchEnd', []);
  expect(await commandCount(page)).toBe(0);
  expect(await page.evaluate(() => (window as any).testZooms.at(-1))).toBeGreaterThan(1.5);
  const transformed = await position(page, 150, 200);
  expect(transformed.y).toBeGreaterThan(250);
  expect((await pixels(page, [[70, 200]]))[0]).toEqual(white);
  await settings(page, { tool: 'fill', color: '#e06070' }); await tap(page, 150, 200);
  expect(await commandCount(page)).toBe(1);
  await client.detach();
});

test('stylus pressure changes brush width and palm touch does not start a stroke', async ({ page }) => {
  await settings(page, { tool: 'brush', color: '#000000', size: 50, guided: false });
  const client = await page.context().newCDPSession(page);
  const penStroke = async (x: number, pressure: number) => {
    const a = await position(page, x, 210), b = await position(page, x, 260);
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, pointerType: 'pen', force: pressure });
    // CDP supplies an actual second pointer stream while the pen is captured.
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 70, y: 90, id: 99 }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, button: 'left', buttons: 1, pointerType: 'pen', force: pressure });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', pointerType: 'pen', force: 0 });
  };
  await penStroke(90, 0.15); await penStroke(210, 0.95);
  const [lightEdge, heavyEdge] = await pixels(page, [[105, 235], [225, 235]]);
  expect(lightEdge).toEqual(white); expect(heavyEdge[0]).toBeLessThan(25);
  const commands = await page.evaluate(() => (window as any).testEngine.getCommands());
  expect(commands).toHaveLength(2);
  expect(commands[0].points[0].pressure).toBeCloseTo(0.15, 2);
  expect(commands[1].points[0].pressure).toBeCloseTo(0.95, 2);
  await client.detach();
});

test('texture and pencil replay identically after undo, redo and reopening', async ({ page }) => {
  await settings(page, { tool: 'texture', color: '#874570', size: 55 }); await stroke(page, [60, 210], [230, 250]);
  await settings(page, { tool: 'pencil', color: '#324574', size: 25 }); await stroke(page, [60, 270], [230, 280]);
  const result = await page.evaluate(async () => {
    const w = window as any;
    const hash = async () => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (await w.testEngine.exportImage('png', 2)).arrayBuffer()))].join(',');
    const original = await hash();
    w.testEngine.undo(); const undone = await hash(); w.testEngine.redo(); const redone = await hash();
    const commands = w.testEngine.getCommands();
    w.testEngine.destroy();
    const { PaintingCanvas } = await import('/src/canvas.ts');
    w.testEngine = new PaintingCanvas(document.querySelector('#studio')!, w.testArtwork, commands, { onChange: () => {} });
    const reopened = await hash();
    return { original, undone, redone, reopened };
  });
  expect(result.undone).not.toBe(result.original);
  expect(result.redone).toBe(result.original);
  expect(result.reopened).toBe(result.original);
});

test('PNG and JPEG exports include committed colors immediately, have high resolution and ignore zoom', async ({ page }) => {
  await settings(page, { tool: 'fill', color: '#e06070' }); await tap(page, 70, 70);
  const result = await page.evaluate(async () => {
    const engine = (window as any).testEngine;
    const inspect = async (format: 'png' | 'jpeg') => {
      const blob = await engine.exportImage(format);
      const image = await createImageBitmap(blob);
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      const pixel = [...ctx.getImageData(70 * 3, 70 * 3, 1, 1).data];
      const result = { type: blob.type, width: image.width, height: image.height, pixel };
      image.close(); return result;
    };
    const png = await inspect('png'); engine.zoomBy(4); const jpeg = await inspect('jpeg');
    return { png, jpeg };
  });
  expect(result.png.type).toBe('image/png'); expect(result.jpeg.type).toBe('image/jpeg');
  for (const image of [result.png, result.jpeg]) { expect(image.width).toBe(900); expect(image.height).toBe(1200); }
  expect(result.png.pixel).toEqual([224, 96, 112, 255]);
  result.jpeg.pixel.slice(0, 3).forEach((n, i) => expect(Math.abs(n - result.png.pixel[i])).toBeLessThan(5));
});

test('export commits a live stroke and pointer cancellation discards an interrupted one', async ({ page }) => {
  await settings(page, { tool: 'brush', color: '#355f80', size: 30 });
  const a = await position(page, 60, 210), b = await position(page, 200, 210);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 });
  expect((await pixels(page, [[120, 210]]))[0]).toEqual([53, 95, 128, 255]);
  await page.mouse.up(); expect(await commandCount(page)).toBe(1);
  await page.mouse.move(a.x, a.y + 40); await page.mouse.down();
  await page.evaluate(() => {
    const canvas = (window as any).testEngine.element;
    canvas.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true }));
  });
  await page.mouse.up(); expect(await commandCount(page)).toBe(1);
});
