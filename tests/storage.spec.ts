import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.goto('/tests/harness.html'); });

test('editable commands and original vector snapshot survive a restart', async ({ page }) => {
  await page.evaluate(async () => {
    const store = await import('/src/storage.ts');
    const art = { id: 'retired-library-drawing', width: 768, height: 1024, regions: [{ id: 'skin', path: 'M0 0H768V1024H0Z' }], lines: [] };
    await store.saveDocument({ id: 'persistent', artworkId: art.id, title: 'My portrait', createdAt: 1, updatedAt: 2, favorite: true, artworkSnapshot: art, commands: [{ id: 'stroke', tool: 'brush', color: '#a5654d', secondaryColor: '#fafafa', opacity: .45, size: 20, regionId: 'skin', points: [{ x: 123.5, y: 328.1, pressure: .72 }], seed: 37 }] });
  });
  await page.reload();
  const saved = await page.evaluate(async () => (await import('/src/storage.ts')).getDocument('persistent'));
  expect(saved?.title).toBe('My portrait');
  expect(saved?.commands[0].points[0]).toEqual({ x: 123.5, y: 328.1, pressure: .72 });
  expect(saved?.commands[0].regionId).toBe('skin');
  expect(saved?.artworkSnapshot?.regions[0].path).toBe('M0 0H768V1024H0Z');
});

test('duplicate, rename, favorite, and deletion preserve the original', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = await import('/src/storage.ts');
    await s.saveDocument({ id: 'original', artworkId: 'portrait', title: 'First', commands: [], favorite: false, createdAt: 1, updatedAt: 1 });
    const copy = await s.duplicateDocument('original');
    copy.title = 'Renamed copy'; copy.favorite = true;
    await s.saveDocument(copy);
    const before = await s.getDocument(copy.id);
    await s.deleteDocument(copy.id);
    return { before, after: await s.getDocument(copy.id), original: await s.getDocument('original') };
  });
  expect(result.before?.title).toBe('Renamed copy');
  expect(result.before?.favorite).toBe(true);
  expect(result.after).toBeUndefined();
  expect(result.original?.title).toBe('First');
  expect(result.original?.favorite).toBe(false);
});

test('rapid queued saves keep the newest edit and copy data before async writes', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = await import('/src/storage.ts');
    const doc = { id: 'rapid', artworkId: 'portrait', title: 'One', commands: [], favorite: false, createdAt: 1, updatedAt: 1 };
    const first = s.saveDocument(doc);
    doc.title = 'Two'; doc.updatedAt = 2;
    const second = s.saveDocument(doc);
    doc.title = 'Unsaved mutation';
    await Promise.all([first, second]);
    return s.getDocument('rapid');
  });
  expect(result?.title).toBe('Two');
  expect(result?.updatedAt).toBe(2);
});

test('palette and theme preferences persist with malformed JSON recovery', async ({ page }) => {
  await page.evaluate(async () => {
    const s = await import('/src/storage.ts');
    s.savePreferences({ theme: 'dark', swatches: ['#ae7963'], customPalettes: [{ id: 'skin', name: 'Warm skin', colors: ['#efd0b8', '#ae7963', '#684238'] }] });
  });
  await page.reload();
  const settings = await page.evaluate(async () => (await import('/src/storage.ts')).getPreferences());
  expect(settings.theme).toBe('dark');
  expect(settings.customPalettes[0].colors).toHaveLength(3);
  const recovered = await page.evaluate(async () => {
    localStorage.setItem('musemallow.preferences.v1', 'invalid');
    return (await import('/src/storage.ts')).getPreferences();
  });
  expect(recovered.theme).toBe('system');
});

test('gallery summaries keep editable strokes out of browsing memory and preserve them on rename', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const s = await import('/src/storage.ts');
    await s.saveDocument({ id: 'summary-test', artworkId: 'portrait', title: 'Original', createdAt: 1, updatedAt: 2, favorite: false, preview: 'thumbnail', commands: [{ id: 'paint', tool: 'fill', color: '#abcdef', secondaryColor: '#ffffff', opacity: 1, size: 12, points: [], seed: 1, regionId: 'skin' }] });
    const row = (await s.listDocuments()).find(x => x.id === 'summary-test')!;
    row.title = 'New name'; row.favorite = true;
    await s.saveDocument(row);
    return { row, full: await s.getDocument(row.id) };
  });
  expect(result.row.commands).toHaveLength(0);
  expect(result.row.commandCount).toBe(1);
  expect(result.full?.commands).toHaveLength(1);
  expect(result.full?.title).toBe('New name');
  expect(result.full?.preview).toBe('thumbnail');
});
