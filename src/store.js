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

/** Résultat d'une sauvegarde : ok, voyage invalide (jamais écrit), stockage indisponible (navigation privée…),
 * plein (quota dépassé), ou autre erreur.
 * @typedef {'ok'|'invalide'|'indisponible'|'plein'|'erreur'} SaveStatus */

/** Erreur de quota, quel que soit le navigateur. @param {any} e */
export function isQuotaError(e) {
  const n = e && (e.name || (e.inner && e.inner.name));
  return n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED' || (e && e.code === 22);
}

/** Sauvegarde et dit pourquoi elle échoue. Si le stockage est plein, on libère le voyage abîmé mis de côté et on réessaie une fois.
 * @param {Backend|null} db @param {SavedTrip} d @returns {Promise<SaveStatus>} */
export async function saveTripStatus(db, d) {
  if (!isValidTrip(d)) return 'invalide';
  if (!db) return 'indisponible';
  try { await db.set(KEY, d); return 'ok'; } catch (e) {
    if (!isQuotaError(e)) return 'erreur';
    try { await db.del(KEY + '.abimee'); await db.set(KEY, d); return 'ok'; } catch { return 'plein'; }
  }
}

/** @param {Backend|null} db @param {SavedTrip} d @returns {Promise<boolean>} */
export async function saveTrip(db, d) { return (await saveTripStatus(db, d)) === 'ok'; }

/** @param {Backend|null} db */
export async function clearTrip(db) { if (!db) return; try { await db.del(KEY); } catch { /* bloqué */ } }

/** Version du schéma IndexedDB (magasins d'objets), distincte de SAVE_VERSION (format du voyage). */
export const DB_VERSION = 1;
/** Au-delà, l'ouverture est abandonnée : certains Safari laissent indexedDB.open sans réponse. */
export const OPEN_TIMEOUT_MS = 4000;

/** La fabrique IndexedDB du navigateur ; y accéder peut lever une erreur (iframe isolée, cookies bloqués). */
export function defaultFactory() { try { return globalThis.indexedDB || null; } catch { return null; } }

/** IndexedDB du navigateur, ou null s'il est indisponible (navigation privée stricte, fichier local…).
 * Une ouverture ratée n'est pas gardée en mémoire : l'appel suivant réessaie.
 * @param {IDBFactory|null} [factory] @param {number} [timeoutMs] @returns {Backend|null} */
export function idbBackend(factory = defaultFactory(), timeoutMs = OPEN_TIMEOUT_MS) {
  if (!factory) return null;
  const f = factory;
  /** @type {Promise<IDBDatabase>|null} */
  let opening = null;
  const open = () => opening ??= new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('ouverture trop longue')), timeoutMs);
    const done = (/** @type {() => void} */ fn) => { clearTimeout(timer); fn(); };
    /** @type {IDBOpenDBRequest} */
    let r;
    try { r = f.open(DB_NAME, DB_VERSION); } catch (e) { done(() => rej(e)); return; }
    r.onupgradeneeded = () => {
      // une étape par version de schéma ; v1 : un magasin clé -> valeur
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => done(() => {
      const db = r.result;
      // un autre onglet passe à un schéma plus récent : on se retire proprement
      db.onversionchange = () => { db.close(); opening = null; };
      res(db);
    });
    r.onerror = () => done(() => rej(r.error));
    r.onblocked = () => done(() => rej(new Error('bloqué')));
  }).catch(e => { opening = null; throw e; });
  /** @param {'readonly'|'readwrite'} mode @param {(s:IDBObjectStore)=>IDBRequest} fn */
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => {
    const tx = db.transaction(STORE, mode), q = fn(tx.objectStore(STORE));
    tx.oncomplete = () => res(q.result); tx.onerror = () => rej(tx.error || q.error); tx.onabort = () => rej(tx.error || q.error || new Error('annulé'));
  }));
  /** @type {Backend} */
  const b = {
    get: k => run('readonly', s => s.get(k)),
    set: (k, v) => run('readwrite', s => s.put(v, k)).then(() => {}),
    del: k => run('readwrite', s => s.delete(k)).then(() => {}),
  };
  return b;
}

/** Message pour l'utilisateur quand le voyage n'a pas pu être gardé ('' si rien à dire).
 * @param {SaveStatus} status @returns {string} */
export function saveMessage(status) {
  if (status === 'plein') return 'Le stockage de ce navigateur est plein : votre voyage n\'a pas pu être gardé pour la prochaine visite. Téléchargez le carnet pour le conserver.';
  if (status === 'indisponible') return 'Ce navigateur ne permet pas de garder le voyage (navigation privée ?) : téléchargez le carnet pour le conserver.';
  if (status === 'erreur') return 'Votre voyage n\'a pas pu être gardé pour la prochaine visite. Téléchargez le carnet pour le conserver.';
  return '';
}
