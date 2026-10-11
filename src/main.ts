import './style.css';
import { PaintingCanvas } from './canvas';
import { listDocuments, saveDocument, getDocument, deleteDocument, duplicateDocument, getPreferences, savePreferences, getArtwork } from './storage';
import { shareImage, initNative } from './native';
import type { ArtworkMeta, PaintingDocument, CanvasSettings, Tool, PaintCommand } from './types';

const icons: Record<string, string> = {
  flower: '<path d="M12 7C6-2 0 8 7 12c-9 6 1 12 5 5 6 9 12-1 5-5 9-6-1-12-5-5Z"/><circle cx="12" cy="12" r="2.2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  gallery: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="m4 17 5-5 4 4 3-3 5 5"/><circle cx="15" cy="9" r="2"/>',
  heart: '<path d="M20.8 4.6a5.6 5.6 0 0 0-8 .5l-.8.9-.8-.9a5.6 5.6 0 0 0-8-.5c-2.3 2.3-2 6 .4 8.4L12 21l8.4-8c2.4-2.4 2.7-6.1.4-8.4Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  fill: '<path d="m8 3 11 11-7 7-9-9 7-7m-5 9h13M20 17s-2 2.4-2 3.5a2 2 0 0 0 4 0C22 19.4 20 17 20 17Z"/>',
  brush: '<path d="m9 14 9-11a2.1 2.1 0 0 1 3 3L10 16M4 15c4-3 8 3 3 5-2 1-5 1-5 1s2-2 2-6Z"/>',
  airbrush: '<path d="m4 17 8-8 4 4-8 8H4v-4ZM11 10l-2-2 3-3 7 7-3 3"/><path d="M17 3h.01M21 5h.01M21 9h.01M17 7h.01"/>',
  gradient: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 5v14m4-14v14m4-14v14"/>',
  pencil: '<path d="m3 21 5-1L21 7l-4-4L4 16l-1 5Zm11-15 4 4M4 16l4 4"/>',
  texture: '<path d="m7 3 14 14-4 4L3 7l4-4Z"/><path d="M4 14h.01M3 20h.01M9 20h.01M8 15h.01M12 18h.01"/>',
  eraser: '<path d="m4 12 9-9a2 2 0 0 1 3 0l5 5a2 2 0 0 1 0 3l-9 10H7l-4-5a3 3 0 0 1 1-4Zm4-4 10 10M11 21h10"/>',
  eyedropper: '<path d="m14 4 6 6M16 2l6 6-3 3-6-6 3-3ZM13 7 3 17v4h4L17 11"/>',
  undo: '<path d="M4 10h10a7 7 0 0 1 0 14" transform="translate(0 -4)"/><path d="m9 1-5 5 5 5"/>',
  redo: '<path d="M20 10H10a7 7 0 0 0 0 14" transform="translate(0 -4)"/><path d="m15 1 5 5-5 5"/>',
  fit: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5m-2-9 8-8M3 3l8 8m2 2 8 8M3 21l8-8"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20.5 14A9 9 0 0 1 10 3a9 9 0 1 0 10.5 11Z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="3"/><path d="M16 8V3H3v13h5"/>',
  sparkle: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/>',
  leaf: '<path d="M4 20C-1 5 12 2 21 3c0 11-5 19-17 17Zm0 0L16 8"/>',
};
const icon = (name: string, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.sparkle}</svg>`;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]!));
const app = document.querySelector<HTMLDivElement>('#app')!;
let prefs = getPreferences();
let catalog: ArtworkMeta[] = [];
const featuredCategories = ['Quiet Moments', 'Dreamlight Portraits', 'Floral Reverie', 'Portrait Atelier', 'Artist Studies'];
let documents: PaintingDocument[] = [];
let view: 'library' | 'gallery' | 'favorites' | 'editor' = 'library';
let previousView: 'library' | 'gallery' | 'favorites' = 'library';
let category = 'All drawings', difficulty = 'All levels', query = '';
let current: PaintingDocument | undefined;
let painter: PaintingCanvas | undefined;
let lastRegion: string | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveChain: Promise<void> = Promise.resolve();
let saveRevision = 0;
let dialogCleanup: (() => void) | undefined;
let toastTimer: ReturnType<typeof setTimeout>;
let opening = false;
const referenceImageCleanup = new WeakMap<HTMLElement, () => void>();
const settings: CanvasSettings = { tool: 'fill', color: '#B77855', secondaryColor: '#F4CFA8', size: 22, opacity: 1, guided: true };
const toolNames: Record<Tool, string> = { fill: 'Fill', brush: 'Brush', airbrush: 'Shade', gradient: 'Gradient', pencil: 'Pencil', texture: 'Texture', eraser: 'Eraser', eyedropper: 'Pick color' };
const palettes = [
  { name: 'Skin · warm', colors: ['#FAE5CD', '#F4CFA8', '#E8B991', '#DCA37B', '#C58A61', '#B77855', '#9A6346', '#81503C', '#663E31', '#4C2F27', '#35231F', '#F0BAA2'] },
  { name: 'Skin · cool', colors: ['#F8E5E0', '#EED3CE', '#DEB8AB', '#CFA094', '#BB8C80', '#A77A72', '#966D63', '#805C53', '#694A45', '#523C38', '#3D2C2B', '#CBA8A4'] },
  { name: 'Hair', colors: ['#262120', '#44332B', '#674732', '#906044', '#B17744', '#D2A666', '#F0CF8D', '#DCCFBE', '#AF786E', '#B18BD1', '#639998', '#DA87A0'] },
  { name: 'Makeup', colors: ['#F3C8C3', '#ECA7A8', '#DF848D', '#CB6278', '#AC3D5E', '#843648', '#653042', '#D9B790', '#BC9277', '#A87C89', '#847AAB', '#625573'] },
  { name: 'Pastels', colors: ['#FBEAB8', '#FFD09B', '#F6B8A8', '#F4BDD0', '#DDBCE8', '#C4B9EF', '#B8D0F1', '#B5DFDF', '#B9DFBA', '#D9E6AA', '#F1E7D7', '#E8D9D2'] },
  { name: 'Fabrics', colors: ['#F4F0E6', '#D8C9AE', '#B4987C', '#796758', '#D9915A', '#BA6E58', '#8E5063', '#596E88', '#344F67', '#739480', '#455F51', '#30333E'] },
  { name: 'Jewel box', colors: ['#DAB46B', '#E5A43C', '#E57750', '#C34668', '#9F3869', '#7955A5', '#584589', '#345FA0', '#2F88A0', '#24786F', '#3D865C', '#758546'] },
  { name: 'Monochrome', colors: ['#FFFFFF', '#F0ECE8', '#DED8D3', '#CCC4BE', '#B8AFA9', '#A29893', '#8B827D', '#766C68', '#605753', '#4A4240', '#332D2C', '#211D1D'] },
];
let paletteIndex = 0;

function applyTheme() {
  document.documentElement.dataset.theme = prefs.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : prefs.theme;
  document.documentElement.classList.toggle('reduce-motion', prefs.reducedMotion);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', document.documentElement.dataset.theme === 'dark' ? '#24212A' : '#FBF8F3');
}
function persistPrefs(update: Partial<typeof prefs>) { prefs = { ...prefs, ...update }; try { savePreferences(update); } catch { toast('Your settings work for this session. Free some device space to keep them after closing.'); } }
function toast(message: string) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = message; document.body.append(el);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 3900);
}
function nav() {
  return `<nav class="main-nav" aria-label="Main navigation">${[['library', 'grid', 'Explore'], ['gallery', 'gallery', 'My studio'], ['favorites', 'heart', 'Favorites']].map(([id, glyph, label]) => `<button class="nav-button ${view === id ? 'active' : ''}" data-action="navigate" data-view="${id}" ${view === id ? 'aria-current="page"' : ''}>${icon(glyph)}<span>${label}</span></button>`).join('')}</nav>`;
}
function header() {
  return `<header class="app-header"><a class="brand" href="#" data-action="home" aria-label="Musemallow home"><span class="brand-symbol">${icon('flower')}</span><span>musemallow<span class="brand-caption">a little color, a little calm</span></span></a>${nav()}<div class="header-actions"><span class="offline-status"><span></span> Your offline happy place</span><button class="icon-button settings-button" data-action="settings" aria-label="Settings">${icon('settings')}</button></div></header>`;
}
function artworkCard(art: ArtworkMeta, index: number) {
  const favorite = prefs.favorites.includes(art.id);
  return `<article class="art-card" style="--card-bg:${['#EEE7F7', '#F8E5DC', '#E5ECDF', '#F8ECCB', '#E3EAF3', '#F3E1E9'][index % 6]}"><button class="art-image-button" data-action="open-art" data-id="${esc(art.id)}" aria-label="Color ${esc(art.title)}"><img src="${esc(art.thumbnail)}" alt="${esc(art.title)} — adult ${esc(art.category.toLowerCase())} line illustration" loading="lazy" draggable="false"/><span class="card-color-cta">${icon('brush')} Make it yours</span></button><button class="favorite-button ${favorite ? 'is-favorite' : ''}" data-action="favorite" data-id="${esc(art.id)}" aria-label="${favorite ? 'Remove' : 'Add'} ${esc(art.title)} ${favorite ? 'from' : 'to'} favorites" aria-pressed="${favorite}">${icon('heart')}</button><div class="art-card-details"><button data-action="open-art" data-id="${esc(art.id)}" class="art-title">${esc(art.title)}</button><div class="art-card-meta"><span>${esc(art.category)}</span><span class="difficulty-badge ${art.difficulty.toLowerCase()}"><i></i>${art.difficulty}</span></div></div></article>`;
}
function docCard(doc: PaintingDocument, compact = false) {
  const art = catalog.find(a => a.id === doc.artworkId);
  return `<article class="work-card ${compact ? 'compact' : ''}"><button class="work-preview" data-action="open-doc" data-id="${doc.id}" aria-label="Continue ${esc(doc.title)}"><img src="${esc(doc.preview || art?.thumbnail || '')}" alt="${esc(doc.title)}" loading="lazy"/><span class="work-resume">${icon('brush')}</span></button><div class="work-details"><button class="art-title" data-action="open-doc" data-id="${doc.id}">${esc(doc.title)}</button><span>${compact ? 'Pick up where you left off' : `Edited ${new Date(doc.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}</span></div><button class="icon-button work-menu" data-action="doc-menu" data-id="${doc.id}" aria-label="Options for ${esc(doc.title)}">${icon('more')}</button></article>`;
}
function filteredArt() {
  const filtered = catalog.filter(a => (view !== 'favorites' || prefs.favorites.includes(a.id)) && (category === 'All drawings' || a.category === category) && (difficulty === 'All levels' || a.difficulty === difficulty) && (!query || `${a.title} ${a.category} ${a.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  if (category !== 'All drawings') return filtered;
  const featured = featuredCategories.flatMap(name => filtered.filter(art => art.category === name));
  const groups = [...new Set(filtered.map(art => art.category).filter(name => !featuredCategories.includes(name)))].map(name => filtered.filter(art => art.category === name));
  const mixed: ArtworkMeta[] = [...featured];
  for (let row = 0; groups.some(group => row < group.length); row++) {
    for (const group of groups) if (group[row]) mixed.push(group[row]);
  }
  return mixed;
}
function renderGrid() {
  const cards = filteredArt();
  const grid = document.querySelector('#art-grid');
  if (grid) grid.innerHTML = cards.length ? cards.map(artworkCard).join('') : `<div class="empty-state">${icon(view === 'favorites' ? 'heart' : 'search')}<h3>${view === 'favorites' ? 'Keep your muses close' : 'No drawings found'}</h3><p>${view === 'favorites' ? 'Tap the heart on any drawing to save it here.' : 'Try a different search or a lighter set of filters.'}</p><button class="button secondary" data-action="clear-filters">${view === 'favorites' ? 'Explore drawings' : 'Clear filters'}</button></div>`;
  const count = document.querySelector('#results-count'); if (count) count.textContent = `${cards.length} drawings to make your own`;
}
function renderHome() {
  const gallery = view === 'gallery';
  const favoriteView = view === 'favorites';
  const cats = ['All drawings', ...featuredCategories.filter(name => catalog.some(art => art.category === name)), ...new Set(catalog.map(a => a.category).filter(name => !featuredCategories.includes(name)))];
  document.body.classList.remove('editor-open', 'canvas-fullscreen');
  app.innerHTML = `${header()}<main class="home-main">
  ${view === 'library' ? `<section class="hero"><div class="hero-copy"><div class="eyebrow"><span class="tiny-flower">${icon('sparkle')}</span> YOUR VERY OWN POCKET ART STUDIO</div><h1>Less rush.<br/>More <em>color.</em></h1><p>Beautiful faces. Limitless possibilities.<br/>Find your muse and make a little time for you.</p><button class="button primary hero-button" data-action="surprise">Find my next muse ${icon('arrow')}</button><div class="hero-footnote"><span class="mini-palette"><i></i><i></i><i></i></span> A fresh perspective in every shade</div></div><div class="hero-art"><span class="hero-orbit orbit-one"></span><span class="hero-orbit orbit-two"></span><img class="studio-cover" src="/studio-cover.png" alt="Original colorful portrait illustration in a playful personal art studio"/><span class="hero-sticker sticker-top">${icon('sparkle')} Made for your happy place</span><span class="hero-sticker sticker-bottom">${icon('leaf')} No rules. Just you.</span><span class="hero-doodle">${icon('flower')}</span></div></section>
  ${documents.length ? `<section class="continue-section"><div class="section-heading small"><h2>Right where you left off <span class="heading-dot"></span></h2><button class="text-button" data-action="navigate" data-view="gallery">My studio ${icon('arrow')}</button></div><div class="continue-grid">${documents.slice(0, 3).map(d => docCard(d, true)).join('')}</div></section>` : ''}` : `<section class="page-intro"><span class="eyebrow">${gallery ? 'A SPACE FOR EVERY SHADE OF YOU' : 'YOUR PERSONALLY PICKED INSPIRATION'}</span><h1>${gallery ? 'My little <em>studio.</em>' : 'Meet your <em>muses.</em>'}</h1><p>${gallery ? 'Works in progress, little experiments, and things you love.' : 'All the drawings that caught your eye, together in one place.'}</p></section>`}
  ${gallery ? `<section class="gallery-section"><div class="section-heading"><h2>Your creations <span class="count-pill">${documents.length}</span></h2><button class="button secondary small-button" data-action="navigate" data-view="library">${icon('plus')} Start something new</button></div><div class="gallery-grid">${documents.length ? documents.map(d => docCard(d)).join('') : `<div class="empty-state">${icon('gallery')}<h3>Every masterpiece starts somewhere</h3><p>Choose a muse, add a little color, and find your creations here.</p><button class="button primary" data-action="navigate" data-view="library">Find a drawing ${icon('arrow')}</button></div>`}</div>${documents.some(d => d.favorite) ? `<div class="section-heading"><h2>Your favorite creations</h2></div><div class="gallery-grid">${documents.filter(d => d.favorite).map(d => docCard(d)).join('')}</div>` : ''}</section>` : `<section class="library-section"><div class="section-heading"><div><div class="eyebrow section-eyebrow">${favoriteView ? 'SAVED FOR A COLORFUL DAY' : 'A WORLD OF PEOPLE, A WORLD OF COLOR'}</div><h2>${favoriteView ? 'Your favorites' : 'Find your next muse'} <span class="count-pill">${favoriteView ? prefs.favorites.length : catalog.length}</span></h2></div><label class="search-box">${icon('search')}<input id="search" type="search" placeholder="Search your inspiration…" value="${esc(query)}" aria-label="Search drawings" autocomplete="off"/></label></div><div class="category-scroll" aria-label="Drawing categories">${cats.map((c, i) => `<button class="category-chip ${category === c ? 'selected' : ''}" data-action="category" data-category="${esc(c)}" aria-pressed="${category === c}">${i === 0 ? icon('grid') : ''}${esc(c)}</button>`).join('')}</div><div class="filter-row"><p id="results-count"></p><label class="difficulty-select">${icon('settings')}<select id="difficulty" aria-label="Filter difficulty">${['All levels', 'Easy', 'Medium', 'Hard'].map(d => `<option ${d === difficulty ? 'selected' : ''}>${d}</option>`).join('')}</select></label></div><div class="art-grid" id="art-grid"></div></section>`}
  <footer class="studio-footer">${icon('flower')} A little time for yourself looks good on you.<span>Made for offline moments · No ads, just art</span></footer></main><div class="mobile-nav">${nav()}</div>`;
  if (!gallery) renderGrid();
  const cover = document.querySelector<HTMLImageElement>('.studio-cover');
  if (cover) cover.onerror = () => { cover.onerror = null; cover.src = catalog[0]?.thumbnail || ''; cover.classList.add('fallback-cover'); };
  document.querySelector('#search')?.addEventListener('input', e => { query = (e.target as HTMLInputElement).value; renderGrid(); });
  document.querySelector('#difficulty')?.addEventListener('change', e => { difficulty = (e.target as HTMLSelectElement).value; renderGrid(); });
}
async function navigate(next: 'library' | 'gallery' | 'favorites') {
  if (view === 'editor') await leaveEditor();
  closeDialog(); view = next; category = 'All drawings'; difficulty = 'All levels'; query = '';
  documents = (await listDocuments()).sort((a, b) => b.updatedAt - a.updatedAt); renderHome(); window.scrollTo(0, 0);
}
function saveStatus(text: string, error = false) { const el = document.querySelector('#save-status'); if (el) { el.textContent = text; el.classList.toggle('save-error', error); } }
function queueSave(immediate = false) {
  clearTimeout(saveTimer);
  if (!current || !painter) return;
  saveStatus('Saving…');
  const execute = () => {
    if (!current || !painter) return;
    current.updatedAt = Date.now(); current.commands = painter.getCommands(); current.preview = painter.preview();
    const snapshot = structuredClone(current); const rev = ++saveRevision;
    saveChain = saveChain.catch(() => {}).then(async () => { try { await saveDocument(snapshot); if (rev === saveRevision) saveStatus('Saved on this device'); } catch (error) { saveStatus('Save failed · tap to retry', true); toast('Your artwork is still open. Free some device space, then tap the save status to retry.'); throw error; } });
    void saveChain.catch(() => {});
  };
  if (immediate) execute(); else saveTimer = setTimeout(execute, 450);
}
function flushChanges() { painter?.finishStroke(); queueSave(true); }
async function leaveEditor() {
  flushChanges();
  try { await saveChain; } catch { throw new Error('Please save or export this drawing before leaving.'); }
  hideReference(false);
  painter?.destroy(); painter = undefined; current = undefined;
  document.body.classList.remove('canvas-fullscreen');
}
async function openDrawing(id: string, existing = false) {
  if (opening) return; opening = true;
  try {
    if (view === 'editor') await leaveEditor();
    let doc = existing ? await getDocument(id) : undefined;
    const art = doc?.artworkSnapshot || await getArtwork(doc?.artworkId || id);
    if (!doc) {
      const meta = catalog.find(a => a.id === id)!;
      doc = { id: crypto.randomUUID(), artworkId: id, title: meta?.title || 'My muse', createdAt: Date.now(), updatedAt: Date.now(), commands: [], favorite: false, artworkSnapshot: art };
    }
    doc.artworkSnapshot = art; current = doc;
    previousView = view === 'editor' ? previousView : view; view = 'editor'; lastRegion = undefined; settings.lockedRegionId = undefined;
    renderEditor();
    painter = new PaintingCanvas(document.querySelector<HTMLElement>('#painting-surface')!, art, doc.commands, {
      onChange(commands: PaintCommand[]) { if (current) current.commands = commands; queueSave(document.hidden); },
      onPickColor(color: string) { setColor(color); toast('Color picked'); },
      onRegion(regionId: string | undefined) { lastRegion = regionId; },
      onHistory(canUndo: boolean, canRedo: boolean) { const undo = document.querySelector<HTMLButtonElement>('[data-action="undo"]'); const redo = document.querySelector<HTMLButtonElement>('[data-action="redo"]'); if (undo) undo.disabled = !canUndo; if (redo) redo.disabled = !canRedo; },
      onZoom(zoom: number) { const el = document.querySelector('#zoom-value'); if (el) el.textContent = `${Math.round(zoom * 100)}%`; },
    });
    painter.setSettings(settings); updateToolUI();
  } catch (error) { toast(error instanceof Error ? error.message : 'This drawing could not be loaded. Please try again.'); }
  finally { opening = false; }
}
function renderEditor() {
  const reference = currentReference();
  document.body.classList.add('editor-open');
  app.innerHTML = `<div class="editor"><header class="editor-header"><button class="icon-button back-button" data-action="back" aria-label="Back to studio">${icon('back')}</button><div class="editor-title"><h1>${esc(current?.title)}</h1><button id="save-status" data-action="save" aria-label="Save drawing">${current?.commands.length ? 'Saved on this device' : 'Your next little masterpiece'}</button></div><div class="editor-header-actions"><button class="icon-button" data-action="editor-menu" aria-label="Drawing options">${icon('more')}</button><button class="button primary export-button" data-action="export-menu">${icon('download')}<span>Export</span></button></div></header><main class="canvas-stage ${reference ? 'has-reference' : ''}"><div class="canvas-note">${icon('leaf')} Take your time. Make it yours.</div><div id="painting-surface" aria-label="Painting canvas" role="application"></div><div class="canvas-top-controls"><div class="history-controls"><button class="icon-button" data-action="undo" aria-label="Undo" title="Undo" disabled>${icon('undo')}</button><button class="icon-button" data-action="redo" aria-label="Redo" title="Redo" disabled>${icon('redo')}</button>${reference ? `<button class="reference-open" data-action="reference" aria-label="Open colored reference" aria-haspopup="dialog">${icon('gallery')}<span>Reference</span></button>` : ''}</div><button class="icon-button" data-action="fullscreen" aria-label="Toggle full-screen canvas" title="Full-screen canvas">${icon('expand')}</button></div><div class="canvas-bottom-controls"><span class="gesture-hint">Pinch to zoom · two fingers to move</span><div class="zoom-controls"><button class="icon-button" data-action="zoom-out" aria-label="Zoom out">${icon('minus')}</button><button id="zoom-value" data-action="fit" title="Fit to screen">100%</button><button class="icon-button" data-action="zoom-in" aria-label="Zoom in">${icon('plus')}</button><span></span><button class="icon-button" data-action="fit" aria-label="Fit to screen">${icon('fit')}</button></div></div></main><section class="painting-controls" aria-label="Painting tools"><div class="color-strip"><button class="active-color-button" data-action="colors" aria-label="Open color picker"><span id="active-color" style="background:${settings.color}"></span>${icon('plus')}</button><div class="palette-swatches" id="quick-colors">${quickColors()}</div><button class="palette-open-button" data-action="colors" aria-label="All color palettes">${icon('grid')}<span>Palettes</span></button></div><div class="tools-strip"><div class="primary-tools">${(['fill', 'brush', 'airbrush', 'gradient'] as Tool[]).map(tool => `<button class="tool-button ${settings.tool === tool ? 'selected' : ''}" data-action="tool" data-tool="${tool}" aria-label="${toolNames[tool]} tool" aria-pressed="${settings.tool === tool}">${icon(tool)}<span>${toolNames[tool]}</span></button>`).join('')}<button class="tool-button" data-action="tools" aria-label="More brushes and tool settings">${icon('settings')}<span>More</span></button></div><div class="tool-settings-summary"><span id="tool-hint">Tap a shape to fill it</span><button class="guided-pill" data-action="toggle-guided">${icon('lock')}<span id="guided-label">${settings.guided ? 'Inside the lines' : 'Free painting'}</span></button></div></div></section></div>`;
}
function quickColors() {
  return palettes[paletteIndex].colors.map(color => `<button class="color-swatch ${settings.color.toLowerCase() === color.toLowerCase() ? 'selected' : ''}" style="--swatch:${color}" data-action="color" data-color="${color}" aria-label="Select color ${color}" aria-pressed="${settings.color.toLowerCase() === color.toLowerCase()}"></button>`).join('');
}
function setColor(color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) { toast('Enter a six-digit HEX color, such as #B77855.'); return; }
  settings.color = color.toUpperCase(); painter?.setSettings(settings);
  persistPrefs({ recentColors: [settings.color, ...prefs.recentColors.filter(c => c.toUpperCase() !== settings.color)].slice(0, 18) });
  document.querySelector<HTMLElement>('#active-color')?.style.setProperty('background', color);
  const quick = document.querySelector('#quick-colors'); if (quick) quick.innerHTML = quickColors();
  document.querySelectorAll<HTMLElement>('.color-swatch').forEach(el => { const selected = el.dataset.color?.toUpperCase() === settings.color; el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected)); });
  const hex = document.querySelector<HTMLInputElement>('#hex-color'); if (hex) hex.value = settings.color;
  const picker = document.querySelector<HTMLInputElement>('#full-color'); if (picker) picker.value = settings.color;
  const name = document.querySelector('#current-hex'); if (name) name.textContent = settings.color;
}
function selectTool(tool: Tool) { settings.tool = tool; painter?.setSettings(settings); updateToolUI(); }
function updateToolUI() {
  document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(el => { const selected = el.dataset.tool === settings.tool; el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected)); });
  const hints: Record<Tool, string> = { fill: 'Tap a shape to fill it', brush: 'Paint a little joy', airbrush: 'Build soft, beautiful shading', gradient: 'Drag from light to shadow', pencil: 'A little texture, a lot of character', texture: 'Make your mark', eraser: 'Make room for a new idea', eyedropper: 'Tap the canvas to pick a color' };
  const hint = document.querySelector('#tool-hint'); if (hint) hint.textContent = hints[settings.tool];
  const guided = document.querySelector('#guided-label'); if (guided) guided.textContent = settings.guided ? 'Inside the lines' : 'Free painting';
}
function closeDialog() {
  const cleanup = dialogCleanup; dialogCleanup = undefined;
  document.querySelector('.dialog-backdrop')?.remove(); document.body.classList.remove('dialog-open'); app.inert = false;
  cleanup?.();
}
function sheet(title: string, subtitle: string, content: string, compact = false) {
  closeDialog();
  const prev = document.activeElement as HTMLElement;
  const backdrop = document.createElement('div'); backdrop.className = 'dialog-backdrop';
  backdrop.innerHTML = `<section class="bottom-sheet ${compact ? 'compact-sheet' : ''}" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><div class="sheet-handle"></div><div class="sheet-header"><div><h2 id="dialog-title">${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div><button class="icon-button" data-action="close-dialog" aria-label="Close panel">${icon('close')}</button></div><div class="sheet-content">${content}</div></section>`;
  backdrop.addEventListener('click', e => { if (e.target === backdrop) closeDialog(); });
  backdrop.addEventListener('keydown', e => { if (e.key !== 'Tab') return; const els = [...backdrop.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]')]; const first = els[0], last = els[els.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } });
  document.body.append(backdrop); document.body.classList.add('dialog-open'); app.inert = true; backdrop.querySelector<HTMLButtonElement>('.sheet-header button')?.focus();
  dialogCleanup = () => prev?.isConnected && prev.focus();
}
/** Only packaged image paths are accepted: references remain available without a network. */
function currentReference() {
  const meta = catalog.find(art => art.id === current?.artworkId);
  return meta?.referenceImage && /^\/references\/[a-z0-9-]+\.png$/.test(meta.referenceImage) ? meta : undefined;
}
function loadReference(host: HTMLElement, meta: ArtworkMeta) {
  referenceImageCleanup.get(host)?.();
  host.replaceChildren(); host.dataset.state = 'loading'; host.setAttribute('aria-busy', 'true');
  const status = document.createElement('p'); status.className = 'reference-status'; status.setAttribute('role', 'status');
  status.textContent = 'Opening your color inspiration…';
  const img = document.createElement('img'); img.alt = `Colored inspiration for ${meta.title}`; img.draggable = false; img.hidden = true; img.decoding = 'async';
  let active = true;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => { active = false; clearTimeout(timeout); img.onload = null; img.onerror = null; img.removeAttribute('src'); };
  referenceImageCleanup.set(host, cleanup);
  const stillCurrent = () => active && host.isConnected && current?.artworkId === meta.id;
  img.onload = () => {
    if (!stillCurrent()) return;
    clearTimeout(timeout); img.hidden = false; status.remove(); host.dataset.state = 'ready'; host.setAttribute('aria-busy', 'false');
  };
  const failed = () => {
    if (!stillCurrent()) return;
    clearTimeout(timeout); img.onload = null; img.onerror = null; img.removeAttribute('src');
    img.remove(); host.dataset.state = 'error'; host.setAttribute('aria-busy', 'false');
    status.textContent = 'This reference could not open. Your coloring is safe.';
    const retry = document.createElement('button'); retry.className = 'button secondary reference-retry'; retry.textContent = 'Try again';
    retry.addEventListener('click', () => loadReference(host, meta)); host.append(retry);
  };
  img.onerror = failed;
  timeout = setTimeout(failed, 12000);
  host.append(status, img); img.src = meta.referenceImage!;
}
function showReference() {
  const meta = currentReference(); if (!meta) return;
  painter?.finishStroke();
  sheet('Color inspiration', esc(meta.title), `<div class="reference-image-slot" id="reference-large"></div><p class="reference-note">A little inspiration for your palette. Every color choice is yours.</p><button class="button primary full-width" data-action="reference-pin">${icon('gallery')}Keep beside canvas</button>`);
  document.querySelector('.bottom-sheet')?.classList.add('reference-sheet');
  const host = document.querySelector<HTMLElement>('#reference-large')!;
  loadReference(host, meta);
  const restoreFocus = dialogCleanup;
  dialogCleanup = () => { referenceImageCleanup.get(host)?.(); referenceImageCleanup.delete(host); restoreFocus?.(); };
}
function hideReference(restoreFocus = true) {
  const dock = document.querySelector('.reference-dock');
  const host = dock?.querySelector<HTMLElement>('.reference-image-slot');
  if (host) { referenceImageCleanup.get(host)?.(); referenceImageCleanup.delete(host); }
  dock?.remove(); document.querySelector('.reference-open')?.classList.remove('selected');
  if (restoreFocus) document.querySelector<HTMLButtonElement>('.reference-open')?.focus();
}
function pinReference() {
  const meta = currentReference(), stage = document.querySelector('.canvas-stage'); if (!meta || !stage) return;
  hideReference(false);
  const dock = document.createElement('aside'); dock.className = 'reference-dock'; dock.setAttribute('aria-label', 'Pinned color reference');
  dock.innerHTML = `<span class="reference-caption">Your color inspiration</span><div class="reference-image-slot"></div><div class="reference-dock-controls"><button class="icon-button" data-action="reference" aria-label="Enlarge reference">${icon('expand')}</button><button class="icon-button" data-action="reference-move" aria-label="Move reference to the left">${icon('arrow')}</button><button class="icon-button" data-action="reference-hide" aria-label="Hide reference">${icon('close')}</button></div>`;
  // Pointer events stay on the panel. A gesture beginning on the reference never paints underneath it.
  for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) dock.addEventListener(event, e => e.stopPropagation());
  stage.append(dock); loadReference(dock.querySelector<HTMLElement>('.reference-image-slot')!, meta);
  document.querySelector('.reference-open')?.classList.add('selected');
  dock.querySelector<HTMLButtonElement>('[data-action="reference"]')?.focus();
}
function showTools() {
  sheet('Your creative toolkit', 'A brush for every little detail.', `<div class="all-tools">${(Object.keys(toolNames) as Tool[]).map(t => `<button class="tool-tile ${settings.tool === t ? 'selected' : ''}" data-action="tool" data-tool="${t}" aria-pressed="${settings.tool === t}">${icon(t)}<span>${toolNames[t]}</span></button>`).join('')}</div><div class="slider-row"><label for="brush-size">Brush size <strong id="size-value">${settings.size}px</strong></label><input id="brush-size" type="range" min="1" max="100" value="${settings.size}"/></div><div class="slider-row"><label for="brush-opacity">Opacity <strong id="opacity-value">${Math.round(settings.opacity * 100)}%</strong></label><input id="brush-opacity" type="range" min="5" max="100" value="${settings.opacity * 100}"/></div><div class="option-row"><div><strong>Stay inside the lines</strong><p>Brush strokes stay in the shape where you start.</p></div><button class="switch ${settings.guided ? 'on' : ''}" role="switch" aria-checked="${settings.guided}" aria-label="Guided coloring" data-action="toggle-guided"></button></div><div class="option-row"><div><strong>Lock selected region</strong><p>${settings.lockedRegionId ? 'Only the locked shape can receive paint.' : 'Tap a shape on the canvas, then lock it for shading.'}</p></div><button class="switch ${settings.lockedRegionId ? 'on' : ''}" role="switch" aria-checked="${!!settings.lockedRegionId}" aria-label="Lock selected region" data-action="lock-region"></button></div><label class="option-row secondary-color"><div><strong>Gradient end color</strong><p>Drag across a shape from your current color to this shade.</p></div><input id="secondary-color" aria-label="Gradient end color" type="color" value="${settings.secondaryColor}"/></label><div class="help-note">${icon('sparkle')} With a stylus, pressure naturally changes your stroke. Two fingers always move the canvas.</div>`);
  document.querySelector('#brush-size')?.addEventListener('input', e => { settings.size = +(e.target as HTMLInputElement).value; document.querySelector('#size-value')!.textContent = `${settings.size}px`; painter?.setSettings(settings); });
  document.querySelector('#brush-opacity')?.addEventListener('input', e => { settings.opacity = +(e.target as HTMLInputElement).value / 100; document.querySelector('#opacity-value')!.textContent = `${Math.round(settings.opacity * 100)}%`; painter?.setSettings(settings); });
  document.querySelector('#secondary-color')?.addEventListener('input', e => { settings.secondaryColor = (e.target as HTMLInputElement).value; painter?.setSettings(settings); });
}
function colorButtons(colors: string[]) { return colors.map(c => `<button class="color-swatch ${settings.color === c ? 'selected' : ''}" style="--swatch:${esc(c)}" data-action="color" data-color="${esc(c)}" aria-label="Select color ${esc(c)}"></button>`).join(''); }
function showColors() {
  sheet('A world of color', 'Find a shade that feels like you.', `<div class="color-picker-row"><label class="full-color-label"><input type="color" id="full-color" value="${settings.color}" aria-label="Full color picker"/>${icon('eyedropper')}<span>Choose any color</span></label><div class="hex-control"><label for="hex-color">HEX</label><input id="hex-color" value="${settings.color}" maxlength="7" spellcheck="false" aria-label="HEX color"/><button class="icon-button" data-action="apply-hex" aria-label="Apply HEX color">${icon('check')}</button></div></div><div class="palette-tabs" role="tablist" aria-label="Color palettes">${palettes.map((p, i) => `<button class="category-chip ${i === paletteIndex ? 'selected' : ''}" data-action="palette" data-index="${i}" role="tab" aria-selected="${i === paletteIndex}">${p.name}</button>`).join('')}</div><div class="large-swatches" id="sheet-swatches">${colorButtons(palettes[paletteIndex].colors)}</div><p class="palette-description" id="palette-description">${paletteIndex < 2 ? 'Coordinated highlights, midtones, shadows, and undertones.' : 'A curated family of shades, ready to make your own.'}</p><div class="swatch-section"><div class="section-heading small"><h3>Recently loved</h3></div><div class="small-swatches">${prefs.recentColors.length ? colorButtons(prefs.recentColors) : '<p class="muted">Your recently used colors will appear here.</p>'}</div></div><div class="swatch-section"><div class="section-heading small"><h3>Saved swatches</h3><button class="text-button" data-action="save-swatch">${icon('plus')} Save current</button></div><div class="small-swatches">${prefs.swatches.length ? colorButtons(prefs.swatches) : '<p class="muted">Keep your favorite shades close.</p>'}</div></div><div class="swatch-section"><div class="section-heading small"><h3>My palettes</h3><button class="text-button" data-action="new-palette">${icon('plus')} Create palette</button></div>${prefs.customPalettes.map(p => `<div class="custom-palette"><div class="custom-palette-title"><strong>${esc(p.name)}</strong><button class="icon-button" data-action="delete-palette" data-id="${esc(p.id)}" aria-label="Delete ${esc(p.name)} palette">${icon('trash')}</button></div><div class="small-swatches">${colorButtons(p.colors)}</div></div>`).join('') || '<p class="muted">Create a palette from your saved swatches.</p>'}</div>`);
  document.querySelector('#full-color')?.addEventListener('input', e => setColor((e.target as HTMLInputElement).value));
  document.querySelector('#hex-color')?.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') applyHex(); });
}
function applyHex() { const value = document.querySelector<HTMLInputElement>('#hex-color')!.value.trim(); setColor(value.startsWith('#') ? value : `#${value}`); }
function showSettings() {
  sheet('Make yourself at home', 'Your studio, your way.', `<h3 class="setting-heading">Appearance</h3><div class="theme-options">${[['light', 'sun', 'Light'], ['dark', 'moon', 'Dark'], ['system', 'settings', 'Device']].map(([id, glyph, name]) => `<button class="theme-option ${prefs.theme === id ? 'selected' : ''}" data-action="theme" data-theme="${id}" aria-pressed="${prefs.theme === id}">${icon(glyph)}${name}</button>`).join('')}</div><div class="option-row"><div><strong>Reduce motion</strong><p>A stiller studio, with fewer animations.</p></div><button class="switch ${prefs.reducedMotion ? 'on' : ''}" role="switch" aria-checked="${prefs.reducedMotion}" aria-label="Reduce motion" data-action="reduced-motion"></button></div><div class="about-studio"><span class="brand-symbol">${icon('flower')}</span><h3>musemallow</h3><p>A little color, a little calm.</p><p>Original people-inspired illustrations, made for your imagination. Your artwork stays on this device. No account, ads, purchases, or tracking. Everything works offline.</p><small>Version 1.3 · A studio for all your shades</small></div>`, true);
}
function confirmAction(title: string, message: string, button: string, onConfirm: () => void | Promise<void>) {
  sheet(title, '', `<p class="confirm-message">${esc(message)}</p><div class="confirm-actions"><button class="button secondary" data-action="close-dialog">Keep it</button><button id="confirm-action" class="button danger">${button}</button></div>`, true);
  document.querySelector('#confirm-action')?.addEventListener('click', () => { closeDialog(); void Promise.resolve(onConfirm()).catch(e => toast(e.message || 'Could not complete this action.')); });
}
function nameDialog(title: string, initial: string, onSave: (name: string) => void | Promise<void>) {
  sheet(title, '', `<form id="name-form"><label class="field-label" for="name-input">Name</label><input class="name-input" id="name-input" required maxlength="80" value="${esc(initial)}" autocomplete="off"/><button class="button primary full-width" type="submit">Save ${icon('check')}</button></form>`, true);
  document.querySelector<HTMLFormElement>('#name-form')?.addEventListener('submit', e => { e.preventDefault(); const name = document.querySelector<HTMLInputElement>('#name-input')!.value.trim(); if (!name) return; closeDialog(); void Promise.resolve(onSave(name)).catch(e => toast(e.message || 'Could not save this name.')); });
  document.querySelector<HTMLInputElement>('#name-input')?.focus();
}
async function showDocMenu(id: string) {
  const doc = await getDocument(id); if (!doc) return;
  sheet(esc(doc.title), 'Make a little room for creativity.', `<div class="menu-list"><button data-doc-action="rename">${icon('pencil')}Rename artwork</button><button data-doc-action="duplicate">${icon('copy')}Make a copy</button><button data-doc-action="favorite">${icon('heart')}${doc.favorite ? 'Remove from' : 'Add to'} favorite creations</button><button class="danger-text" data-doc-action="delete">${icon('trash')}Delete artwork</button></div>`, true);
  document.querySelectorAll<HTMLElement>('[data-doc-action]').forEach(el => el.addEventListener('click', async () => {
    const action = el.dataset.docAction; closeDialog();
    try {
      if (action === 'rename') nameDialog('Give it a name', doc.title, async name => { doc.title = name; await saveDocument(doc); await navigate('gallery'); });
      if (action === 'duplicate') { await duplicateDocument(id); await navigate('gallery'); toast('A fresh copy, ready to explore.'); }
      if (action === 'favorite') { doc.favorite = !doc.favorite; await saveDocument(doc); await navigate('gallery'); }
      if (action === 'delete') confirmAction('Let this one go?', 'This removes the saved coloring from this device. The original drawing will still be in the library.', 'Delete artwork', async () => { await deleteDocument(id); await navigate('gallery'); });
    } catch { toast('Could not update your artwork. Please try again.'); }
  }));
}
async function celebrateDrawing() {
  if (!painter || !current) return;
  flushChanges();
  try { await saveChain; } catch { toast('Keep this piece open until it saves. You can still export a copy.'); return; }
  sheet('A little masterpiece, by you.', 'Look what a little time for yourself can become.', `<div class="about-studio" style="border-top:0;padding-top:0;margin-top:0"><img src="${esc(current.preview || painter.preview())}" alt="Your finished coloring, ${esc(current.title)}" style="height:260px;max-width:100%;object-fit:contain;background:#fff;border:8px solid #fff;border-radius:12px;box-shadow:var(--shadow);transform:rotate(-2deg);margin:7px 0 20px"/><h3 style="font-size:24px">${esc(current.title)}</h3><p>Your colors are saved in My studio. Come back whenever inspiration calls — this piece is always yours to keep creating.</p></div><div class="confirm-actions" style="justify-content:center;margin-top:22px"><button class="button primary" data-action="export-menu">${icon('download')} Share your creation</button><button class="button secondary" data-action="close-dialog">Keep creating</button></div>`, true);
}
async function exportDrawing(format: 'png' | 'jpeg') {
  if (!painter || !current) return; closeDialog(); toast('Preparing your high-resolution artwork…');
  try {
    queueSave(true);
    const blob = await painter.exportImage(format, 3);
    const filename = `${current.title.replace(/[^a-z0-9-]/gi, '-').replace(/-+/g, '-')}-musemallow.${format === 'jpeg' ? 'jpg' : 'png'}`;
    await shareImage(blob, filename); toast('Your muse is ready to share.');
  } catch (e) { toast(`Export could not finish. ${e instanceof Error ? e.message : 'Please try again.'}`); }
}
async function handleAction(button: HTMLElement) {
  const action = button.dataset.action;
  switch (action) {
    case 'home': await navigate('library'); break;
    case 'navigate': await navigate(button.dataset.view as 'library' | 'gallery' | 'favorites'); break;
    case 'settings': showSettings(); break;
    case 'category': category = button.dataset.category!; document.querySelectorAll<HTMLElement>('.category-scroll .category-chip').forEach(el => { el.classList.toggle('selected', el.dataset.category === category); el.setAttribute('aria-pressed', String(el.dataset.category === category)); }); renderGrid(); break;
    case 'clear-filters': if (view === 'favorites') await navigate('library'); else { category = 'All drawings'; difficulty = 'All levels'; query = ''; renderHome(); } break;
    case 'favorite': { const id = button.dataset.id!; const on = prefs.favorites.includes(id); persistPrefs({ favorites: on ? prefs.favorites.filter(f => f !== id) : [...prefs.favorites, id] }); if (view === 'favorites') renderGrid(); else { button.classList.toggle('is-favorite', !on); button.setAttribute('aria-pressed', String(!on)); button.setAttribute('aria-label', `${on ? 'Add to' : 'Remove from'} favorites`); } break; }
    case 'surprise': if (catalog.length) await openDrawing(catalog[Math.floor(Math.random() * catalog.length)].id); break;
    case 'open-art': await openDrawing(button.dataset.id!); break;
    case 'open-doc': await openDrawing(button.dataset.id!, true); break;
    case 'doc-menu': await showDocMenu(button.dataset.id!); break;
    case 'back': await navigate(previousView); break;
    case 'save': flushChanges(); break;
    case 'tool': selectTool(button.dataset.tool as Tool); break;
    case 'tools': showTools(); break;
    case 'reference': showReference(); break;
    case 'reference-pin': closeDialog(); pinReference(); break;
    case 'reference-hide': hideReference(); break;
    case 'reference-move': {
      const dock = document.querySelector<HTMLElement>('.reference-dock');
      const left = dock?.classList.toggle('reference-left');
      button.setAttribute('aria-label', `Move reference to the ${left ? 'right' : 'left'}`);
      break;
    }
    case 'color': setColor(button.dataset.color!); break;
    case 'colors': showColors(); break;
    case 'palette': paletteIndex = +button.dataset.index!; showColors(); document.querySelector('#quick-colors')!.innerHTML = quickColors(); break;
    case 'apply-hex': applyHex(); break;
    case 'save-swatch': if (!prefs.swatches.includes(settings.color)) { persistPrefs({ swatches: [...prefs.swatches, settings.color] }); showColors(); toast('Shade saved.'); } else toast('This shade is already saved.'); break;
    case 'new-palette': if (!prefs.swatches.length) { toast('Save a few swatches first, then create your palette.'); break; } nameDialog('Name your palette', 'My favorite shades', name => { persistPrefs({ customPalettes: [...prefs.customPalettes, { id: crypto.randomUUID(), name, colors: [...prefs.swatches] }] }); showColors(); }); break;
    case 'delete-palette': confirmAction('Delete this palette?', 'Your artwork and saved swatches will be kept.', 'Delete palette', () => { persistPrefs({ customPalettes: prefs.customPalettes.filter(p => p.id !== button.dataset.id) }); showColors(); }); break;
    case 'undo': painter?.undo(); break;
    case 'redo': painter?.redo(); break;
    case 'fit': painter?.fit(); break;
    case 'zoom-in': painter?.zoomBy(1.25); break;
    case 'zoom-out': painter?.zoomBy(0.8); break;
    case 'fullscreen': document.body.classList.toggle('canvas-fullscreen'); setTimeout(() => painter?.fit(), 250); break;
    case 'toggle-guided': settings.guided = !settings.guided; painter?.setSettings(settings); updateToolUI(); if (document.querySelector('#brush-size')) showTools(); else toast(settings.guided ? 'Brush strokes stay inside the lines.' : 'Free painting is on.'); break;
    case 'lock-region': if (settings.lockedRegionId) { settings.lockedRegionId = undefined; painter?.lockRegion(undefined); } else if (lastRegion) { settings.lockedRegionId = lastRegion; painter?.lockRegion(lastRegion); } else { toast('First tap a shape on the canvas, then lock it here.'); break; } painter?.setSettings(settings); showTools(); break;
    case 'close-dialog': closeDialog(); break;
    case 'theme': persistPrefs({ theme: button.dataset.theme as typeof prefs.theme }); applyTheme(); showSettings(); break;
    case 'reduced-motion': persistPrefs({ reducedMotion: !prefs.reducedMotion }); applyTheme(); showSettings(); break;
    case 'export-menu': sheet('Made by you. Ready to share.', 'Export the full artwork at 3× resolution, without the studio controls.', `<div class="export-options"><button data-action="export-png">${icon('gallery')}<strong>PNG image</strong><span>Sharp, lossless quality</span>${icon('arrow')}</button><button data-action="export-jpeg">${icon('gallery')}<strong>JPEG image</strong><span>A smaller file for easy sharing</span>${icon('arrow')}</button></div><p class="export-note">Every mark is included, even during a color animation. Your editable original stays in My studio.</p>`, true); break;
    case 'export-png': await exportDrawing('png'); break;
    case 'export-jpeg': await exportDrawing('jpeg'); break;
    case 'celebrate': await celebrateDrawing(); break;
    case 'editor-menu': sheet('A fresh perspective', '', `<div class="menu-list"><button data-action="celebrate">${icon('sparkle')}Celebrate this piece</button><button data-action="rename-current">${icon('pencil')}Rename artwork</button><button data-action="reset">${icon('undo')}Reset coloring</button><button data-action="settings">${icon('settings')}Studio settings</button></div>`, true); break;
    case 'rename-current': nameDialog('Give it a name', current!.title, name => { current!.title = name; document.querySelector('.editor-title h1')!.textContent = name; queueSave(true); }); break;
    case 'reset': confirmAction('Make a fresh start?', 'Your colors and brush strokes will be cleared. The original illustration stays ready for your next idea.', 'Reset coloring', () => { painter?.reset(); toast('A fresh page, a new possibility.'); }); break;
  }
}
document.addEventListener('click', e => { const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]'); if (!button) return; e.preventDefault(); if ((button as HTMLButtonElement).disabled) return; void handleAction(button).catch(error => toast(error instanceof Error ? error.message : 'Something went wrong. Please try again.')); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (document.querySelector('.dialog-backdrop')) closeDialog(); else if (document.querySelector('.reference-dock')) hideReference(); else if (document.body.classList.contains('canvas-fullscreen')) document.body.classList.remove('canvas-fullscreen'); else if (view === 'editor') void navigate(previousView).catch(err => toast(err.message)); }
  if (!e.defaultPrevented && view === 'editor' && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) { e.preventDefault(); if (e.shiftKey) painter?.redo(); else painter?.undo(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) flushChanges(); });
window.addEventListener('pagehide', flushChanges);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (prefs.theme === 'system') applyTheme(); });
async function start() {
  applyTheme();
  app.innerHTML = `<div class="loading-state"><span class="brand-symbol">${icon('flower')}</span><h1>Opening your happy place…</h1><p>A little color is on its way.</p></div>`;
  try {
    const response = await fetch('/art/catalog.json'); if (!response.ok) throw new Error('The drawing library could not be loaded.');
    catalog = await response.json(); documents = (await listDocuments()).sort((a, b) => b.updatedAt - a.updatedAt); renderHome();
    await initNative(async () => { if (document.querySelector('.dialog-backdrop')) { closeDialog(); return true; } if (document.querySelector('.reference-dock')) { hideReference(); return true; } if (document.body.classList.contains('canvas-fullscreen')) { document.body.classList.remove('canvas-fullscreen'); return true; } if (view === 'editor') { try { await navigate(previousView); } catch (e) { toast((e as Error).message); } return true; } if (view !== 'library') { await navigate('library'); return true; } return false; }, flushChanges);
  } catch (error) { app.innerHTML = `<div class="empty-state loading-state">${icon('flower')}<h1>Your studio needs a moment</h1><p>${esc(error instanceof Error ? error.message : 'Please reopen the app to try again.')}</p><button class="button primary" id="retry-start">Try again</button></div>`; document.querySelector('#retry-start')?.addEventListener('click', start); }
}
void start();
