// @ts-check
/** Sauvegarde versionnée du voyage en cours (titre, noms d'étapes, photos réduites),
 * dans IndexedDB : vos photos restent sur l'appareil et le voyage est retrouvé à la prochaine visite.
 * Le même format sert aux carnets téléchargés.
 *
 * Règle : toute modification du format incrémente SAVE_VERSION et ajoute une étape
 * à migrate(). Un voyage abîmé ou plus récent que l'appli n'est jamais écrasé en silence :
 * il est mis de côté sous KEY + '.abimee' et l'appli repart de la démo.
 * Les carnets exportés avant la version 1.1.0 (sans numéro de version) sont repris. */

export const DB_NAME = 'kevoyage';
export const STORE = 'voyage';
export const KEY = 'courant';
export const SAVE_VERSION = 1;
/** Au-delà, la sauvegarde serait trop lourde pour certains navigateurs. */
export const MAX_PHOTOS = 2000;

/** @typedef {{id:number,t:number,lat:number,lon:number,est:boolean,cap:string,place:string,src:string,noDate?:boolean}} SavedPhoto
 * @typedef {{version:number,title:string,names:Record<string,string>,photos:SavedPhoto[]}} SavedTrip
 * @typedef {{get(k:string):Promise<any>,set(k:string,v:any):Promise<void>,del(k:string):Promise<void>}} Backend */

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isStr = (v, max) => typeof v === 'string' && v.length <= max;

/** @param {any} p @returns {p is SavedPhoto} */
export function isValidPhoto(p) {
  return !!p && typeof p === 'object' && Number.isInteger(p.id) && p.id > 0 && isNum(p.t)
    && isNum(p.lat) && p.lat >= -90 && p.lat <= 90 && isNum(p.lon) && p.lon >= -540 && p.lon <= 540
    && typeof p.est === 'boolean' && isStr(p.cap, 500) && isStr(p.place, 200)
    && typeof p.src === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p.src)
    && (p.noDate === undefined || typeof p.noDate === 'boolean');
}

/** @param {any} d @returns {d is SavedTrip} */
export function isValidTrip(d) {
  if (!d || typeof d !== 'object' || d.version !== SAVE_VERSION || !isStr(d.title, 300)) return false;
  if (!d.names || typeof d.names !== 'object' || Array.isArray(d.names)) return false;
  if (!Object.entries(d.names).every(([k, v]) => /^\d+$/.test(k) && isStr(v, 200))) return false;
  if (!Array.isArray(d.photos) || !d.photos.length || d.photos.length > MAX_PHOTOS) return false;
  const ids = new Set();
  for (const p of d.photos) { if (!isValidPhoto(p) || ids.has(p.id)) return false; ids.add(p.id); }
  return true;
}

/** Amène un voyage d'une version antérieure à SAVE_VERSION ; null si inconnu ou trop récent.
 * @param {any} d @returns {any} */
export function migrate(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  let out = structuredClone(d);
  // carnets exportés avant 1.1.0 : pas de numéro de version, cap/place parfois absents
  if (out.version === undefined && Array.isArray(out.photos)) {
    out = { version: 1, title: String(out.title ?? ''), names: out.names || {}, photos: out.photos.map(p => ({ ...p, cap: p.cap || '', place: p.place || '' })) };
  }
  const v = out.version;
  if (!Number.isInteger(v) || v < 1 || v > SAVE_VERSION) return null;
  // Étapes futures, à chaîner ici :
  // if (out.version === 1) { out = v1ToV2(out); }
  return out;
}

/** Données brutes -> voyage valide, ou null. @param {any} raw */
export function parse(raw) { const d = migrate(raw); return isValidTrip(d) ? d : null; }

/** Photos et noms de l'appli -> voyage à sauvegarder.
 * @param {string} title @param {Record<string,string>} names @param {any[]} photos @returns {SavedTrip} */
export function serialize(title, names, photos) {
  const keep = new Set(photos.map(p => String(p.id)));
  /** @type {Record<string,string>} */
  const nm = {};
  for (const [k, v] of Object.entries(names)) if (keep.has(k) && v) nm[k] = String(v).slice(0, 200);
  return {
    version: SAVE_VERSION, title: String(title).slice(0, 300), names: nm,
    photos: photos.map(p => {
      /** @type {SavedPhoto} */
      const o = { id: p.id, t: p.t, lat: p.lat, lon: p.lon, est: !!p.est, cap: p.cap || '', place: p.place || '', src: p.src };
      if (p.noDate) o.noDate = true;
      return o;
    }),
  };
}

/** Lit le voyage sauvegardé ; null s'il n'y en a pas, s'il est abîmé (mis de côté) ou si le stockage est bloqué.
 * @param {Backend|null} db @returns {Promise<SavedTrip|null>} */
export async function loadTrip(db) {
  if (!db) return null;
  let raw;
  try { raw = await db.get(KEY); } catch { return null; }
  if (raw === undefined || raw === null) return null;
  const d = parse(raw);
  if (d) return d;
  try { await db.set(KEY + '.abimee', raw); await db.del(KEY); } catch { /* stockage plein ou bloqué */ }
  return null;
}

/** @param {Backend|null} db @param {SavedTrip} d @returns {Promise<boolean>} */
export async function saveTrip(db, d) {
  if (!db || !isValidTrip(d)) return false;
  try { await db.set(KEY, d); return true; } catch { return false; }
}

/** @param {Backend|null} db */
export async function clearTrip(db) { if (!db) return; try { await db.del(KEY); } catch { /* bloqué */ } }

/** IndexedDB du navigateur, ou null s'il est indisponible (navigation privée stricte, fichier local…). */
export function idbBackend(factory = globalThis.indexedDB) {
  if (!factory) return null;
  /** @type {Promise<IDBDatabase>|null} */
  let opening = null;
  const open = () => opening ??= new Promise((res, rej) => {
    const r = factory.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('bloqué'));
  });
  /** @param {'readonly'|'readwrite'} mode @param {(s:IDBObjectStore)=>IDBRequest} fn */
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode), q = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(q.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
  }));
  /** @type {Backend} */
  const b = {
    get: k => run('readonly', s => s.get(k)),
    set: (k, v) => run('readwrite', s => s.put(v, k)).then(() => {}),
    del: k => run('readwrite', s => s.delete(k)).then(() => {}),
  };
  return b;
}
