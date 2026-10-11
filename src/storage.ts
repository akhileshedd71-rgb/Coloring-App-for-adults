import type { Artwork, PaintingDocument } from './types';

export interface Preferences {
  theme: 'light' | 'dark' | 'system';
  favorites: string[];
  recentColors: string[];
  swatches: string[];
  customPalettes: { id: string; name: string; colors: string[] }[];
  reducedMotion: boolean;
}

const defaults: Preferences = {
  theme: 'system', favorites: [], recentColors: [], swatches: [],
  customPalettes: [], reducedMotion: false,
};
const SETTINGS = 'musemallow.preferences.v1';
let dbPromise: Promise<IDBDatabase> | undefined;

function database(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('musemallow-studio', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('paintings')) {
        const store = db.createObjectStore('paintings', { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('gallery')) {
        request.result.createObjectStore('gallery', { keyPath: 'id' });
        const paintings = request.transaction!.objectStore('paintings');
        const cursor = paintings.openCursor();
        cursor.onsuccess = () => {
          if (!cursor.result) return;
          const painting = cursor.result.value as PaintingDocument;
          request.transaction!.objectStore('gallery').put(summary(painting));
          delete painting.preview;
          cursor.result.update(painting);
          cursor.result.continue();
        };
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => { request.result.close(); dbPromise = undefined; };
      resolve(request.result);
    };
    request.onerror = () => { dbPromise = undefined; reject(new Error('Your studio storage could not open. Please free some device space and retry.')); };
    request.onblocked = () => { dbPromise = undefined; reject(new Error('Close other Musemallow windows to finish updating your studio.')); };
  });
  return dbPromise;
}

async function read<T>(run: (store: IDBObjectStore) => IDBRequest<T>, name = 'paintings'): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(name, 'readonly');
    const request = run(tx.objectStore(name));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error ?? new Error('Storage read interrupted. Please retry.'));
  });
}

let writeQueue: Promise<unknown> = Promise.resolve();
function write(run: (store: IDBObjectStore, gallery: IDBObjectStore) => void): Promise<void> {
  const pending = writeQueue.catch(() => {}).then(async () => {
    const db = await database();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['paintings', 'gallery'], 'readwrite', { durability: 'strict' });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error('Your changes could not be saved. Free some device space, then try again before closing.'));
      tx.onabort = () => reject(new Error('Saving was interrupted. Keep this drawing open and try again.'));
      run(tx.objectStore('paintings'), tx.objectStore('gallery'));
    });
  });
  writeQueue = pending;
  return pending;
}

export async function listDocuments(): Promise<PaintingDocument[]> {
  await writeQueue.catch(() => {});
  return (await read<PaintingDocument[]>(store => store.getAll(), 'gallery')).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDocument(id: string): Promise<PaintingDocument | undefined> {
  await writeQueue.catch(() => {});
  const [painting, row] = await Promise.all([
    read<PaintingDocument | undefined>(store => store.get(id)),
    read<PaintingDocument | undefined>(store => store.get(id), 'gallery'),
  ]);
  return painting ? { ...painting, preview: row?.preview } : undefined;
}

function summary(doc: PaintingDocument): PaintingDocument {
  return {
    id: doc.id, artworkId: doc.artworkId, title: doc.title,
    createdAt: doc.createdAt, updatedAt: doc.updatedAt, favorite: doc.favorite,
    preview: doc.preview, commands: [], commandCount: doc.commands.length, isSummary: true,
  };
}

export function saveDocument(document: PaintingDocument): Promise<void> {
  // Copy at the call boundary: later strokes/title edits cannot mutate a queued write.
  const snapshot = structuredClone(document);
  if (!snapshot.id || !snapshot.artworkId || !Array.isArray(snapshot.commands)) {
    return Promise.reject(new Error('This drawing is incomplete and could not be saved.'));
  }
  return write((store, gallery) => {
    if (snapshot.isSummary) {
      const request = store.get(snapshot.id);
      request.onsuccess = () => {
        const original = request.result as PaintingDocument | undefined;
        if (!original) return;
        original.title = snapshot.title;
        original.favorite = snapshot.favorite;
        original.updatedAt = snapshot.updatedAt;
        store.put(original);
        gallery.put({ ...summary(original), preview: snapshot.preview });
      };
    } else {
      gallery.put(summary(snapshot));
      delete snapshot.preview;
      store.put(snapshot);
    }
  });
}

export function deleteDocument(id: string): Promise<void> {
  return write((store, gallery) => { store.delete(id); gallery.delete(id); });
}

export async function duplicateDocument(id: string): Promise<PaintingDocument> {
  const original = await getDocument(id);
  if (!original) throw new Error('This drawing is no longer in your gallery.');
  const duplicate = structuredClone(original);
  duplicate.id = crypto.randomUUID();
  duplicate.title = `${original.title} · copy`;
  duplicate.createdAt = duplicate.updatedAt = Date.now();
  await saveDocument(duplicate);
  return duplicate;
}

export function getPreferences(): Preferences {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS) || '{}');
    return {
      theme: ['light', 'dark', 'system'].includes(saved.theme) ? saved.theme : defaults.theme,
      favorites: Array.isArray(saved.favorites) ? saved.favorites.filter((x: unknown) => typeof x === 'string') : [],
      recentColors: Array.isArray(saved.recentColors) ? saved.recentColors.slice(0, 16) : [],
      swatches: Array.isArray(saved.swatches) ? saved.swatches : [],
      customPalettes: Array.isArray(saved.customPalettes) ? saved.customPalettes : [],
      reducedMotion: saved.reducedMotion === true,
    };
  } catch { return structuredClone(defaults); }
}

export function savePreferences(changes: Partial<Preferences>): void {
  const updated = { ...getPreferences(), ...changes };
  localStorage.setItem(SETTINGS, JSON.stringify(updated));
}

// Only retain four loaded drawing promises. Existing editors own their own
// immutable reference, so cache eviction never affects an open canvas.
const artworkCache = new Map<string, Promise<Artwork>>();
export function getArtwork(id: string): Promise<Artwork> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return Promise.reject(new Error('Unknown drawing.'));
  const existing = artworkCache.get(id);
  if (existing) { artworkCache.delete(id); artworkCache.set(id, existing); return existing; }
  const pending = fetch(`/art/${id}.json`).then(async response => {
    if (!response.ok) throw new Error('This drawing could not load. Please try opening it again.');
    const art = await response.json() as Artwork;
    if (art.id !== id || !art.width || !art.height || !art.regions?.length || !Array.isArray(art.lines)) throw new Error('This drawing is incomplete.');
    return art;
  }).catch(error => { artworkCache.delete(id); throw error; });
  artworkCache.set(id, pending);
  while (artworkCache.size > 4) artworkCache.delete(artworkCache.keys().next().value!);
  return pending;
}
