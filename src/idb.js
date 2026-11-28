// @ts-check
/** Le voyage dans IndexedDB, rangé par paquets de photos.
 *
 * Schéma (DB_VERSION) :
 *  - v1 : un magasin `voyage`, le voyage entier sous la clé `courant` (titre, noms et toutes les photos).
 *    Renommer une étape réécrivait toutes les photos : environ 70 Mo pour 3000 photos.
 *  - v2 : `voyage/courant` ne garde que l'en-tête (titre, noms, nombre de photos, empreinte de chaque paquet) ;
 *    les photos sont dans le magasin `photos`, par paquets de PAGE photos rangés selon leur numéro.
 *    Une sauvegarde ne réécrit que les paquets qui ont changé, dans une seule transaction : un nom
 *    d'étape coûte quelques octets, un import n'écrit que les nouveaux paquets, et une coupure au
 *    milieu ne laisse jamais un voyage à moitié écrit.
 *  La montée de v1 à v2 range dans la même transaction le voyage déjà gardé en paquets (aucune perte) ;
 *  un enregistrement v1 qu'on ne sait pas ranger reste tel quel et sera relu comme avant. */

export const DB_NAME = 'kevoyage';
export const STORE = 'voyage';
export const PHOTOS = 'photos';
export const KEY = 'courant';
/** Version du schéma IndexedDB (magasins d'objets), distincte de SAVE_VERSION (format du voyage). */
export const DB_VERSION = 2;
/** Photos par paquet : environ 2,3 Mo par paquet pour des photos de 1000 px. */
export const PAGE = 100;
/** Au-delà, l'ouverture est abandonnée : certains Safari laissent indexedDB.open sans réponse. */
export const OPEN_TIMEOUT_MS = 4000;

/** @typedef {{get(k:string):Promise<any>,set(k:string,v:any):Promise<void>,del(k:string):Promise<void>,
 *   readTrip?():Promise<any>,writeTrip?(d:any):Promise<void>,clearTrip?():Promise<void>}} Backend */

/** Paquet d'une photo, d'après son numéro. @param {number} id */
export const pageOf = id => Math.floor((id - 1) / PAGE);

/** @param {number} h @param {string} s @param {number} mul */
function mix(h, s, mul) { for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), mul); return h >>> 0; }

/** Empreinte de chaque image, calculée une seule fois par photo (numéro -> même texte d'image) :
 * hacher toutes les images à chaque sauvegarde coûterait ~120 ms pour 3000 photos sur ordinateur.
 * @type {Map<number,{src:string,a:number,b:number}>} */
const srcSigs = new Map();
/** @param {{id:number,src:string}} p */
function srcSig(p) {
  const c = srcSigs.get(p.id);
  if (c && c.src === p.src) return c;
  const e = { src: p.src, a: mix(2166136261, p.src, 16777619), b: mix(0x9747b28c, p.src, 0x5bd1e995) };
  srcSigs.set(p.id, e);
  return e;
}

/** Empreinte d'un paquet : change dès qu'une photo change (un champ ou un seul caractère de l'image).
 * Deux hachages de 32 bits, pour qu'un changement ne passe jamais inaperçu. @param {any[]} photos */
export function pageSig(photos) {
  let a = 2166136261, b = 0x9747b28c;
  for (const p of photos) {
    const im = srcSig(p);
    const f = [p.id, p.t, p.tz ?? '', p.lat, p.lon, p.est ? 1 : 0, p.noDate ? 1 : 0, p.cap, p.place, p.src.length, im.a, im.b].join('\u0001');
    a = mix(a, f, 16777619); b = mix(b, f, 0x5bd1e995);
  }
  return photos.length.toString(36) + '.' + a.toString(36) + '.' + b.toString(36);
}

/** Voyage complet -> en-tête et paquets ; null si une photo n'a pas de numéro utilisable.
 * @param {any} d @returns {{head:any, pages:Map<number,{sig:string,photos:any[]}>}|null} */
export function split(d) {
  if (!d || typeof d !== 'object' || !Array.isArray(d.photos)) return null;
  /** @type {Map<number,any[]>} */
  const groups = new Map();
  for (const p of d.photos) {
    if (!p || !Number.isInteger(p.id) || p.id < 1 || typeof p.src !== 'string') return null;
    const k = pageOf(p.id), g = groups.get(k);
    if (g) g.push(p); else groups.set(k, [p]);
  }
  const { photos, ...rest } = d;
  /** @type {Record<string,string>} */
  const sigs = {};
  const pages = new Map();
  for (const [k, g] of [...groups].sort((x, y) => x[0] - y[0])) { const sig = pageSig(g); sigs[k] = sig; pages.set(k, { sig, photos: g }); }
  // photos retirées du voyage : leur empreinte d'image n'est plus gardée
  if (srcSigs.size > photos.length) { const ids = new Set(photos.map(p => p.id)); for (const id of srcSigs.keys()) if (!ids.has(id)) srcSigs.delete(id); }
  return { head: { ...rest, n: photos.length, pages: sigs }, pages };
}

/** En-tête rangé en paquets (et non voyage v1 entier) ? @param {any} h */
const isPaged = h => !!h && typeof h === 'object' && !Array.isArray(h.photos) && !!h.pages && typeof h.pages === 'object';

/** Écrit l'en-tête et les paquets d'un voyage v1 dans une transaction ouverte (montée de schéma).
 * @param {IDBTransaction} tx */
function upgradeV1(tx) {
  const vs = tx.objectStore(STORE), ps = tx.objectStore(PHOTOS);
  const q = vs.get(KEY);
  q.onsuccess = () => {
    const s = split(q.result);
    if (!s) return; // abîmé ou sans photos : relu tel quel, et mis de côté s'il le faut
    for (const [k, pg] of s.pages) ps.put(pg, k);
    vs.put(s.head, KEY);
  };
}

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
    r.onupgradeneeded = ev => {
      // une étape par version de schéma, dans l'ordre
      const db = r.result, old = ev.oldVersion;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);           // v1
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);         // v2
      if (old >= 1 && old < 2 && r.transaction) upgradeV1(r.transaction);
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

  /** Transaction sur un ou deux magasins ; fn reçoit les magasins et une fonction d'erreur, et renvoie un getter du résultat.
   * Une exception levée dans fn (ou dans un rappel) annule la transaction avec cette erreur (quota plein, par exemple).
   * @param {string[]} names @param {'readonly'|'readwrite'} mode
   * @param {(st:IDBObjectStore[], guard:(fn:()=>void)=>void)=>(()=>any)} fn */
  const run = (names, mode, fn) => open().then(db => new Promise((res, rej) => {
    const tx = db.transaction(names, mode);
    /** @type {any} */
    let failure = null;
    const guard = (/** @type {()=>void} */ g) => { try { g(); } catch (e) { failure = e; try { tx.abort(); } catch { /* déjà finie */ } } };
    /** @type {()=>any} */
    let out = () => undefined;
    guard(() => { out = fn(names.map(n => tx.objectStore(n)), guard); });
    tx.oncomplete = () => res(out());
    tx.onerror = () => rej(failure || tx.error);
    tx.onabort = () => rej(failure || tx.error || new Error('annulé'));
  }));
  const one = (/** @type {'readonly'|'readwrite'} */ mode, /** @type {(s:IDBObjectStore)=>IDBRequest} */ fn) =>
    run([STORE], mode, ([s]) => { const q = fn(s); return () => q.result; });

  /** @type {Backend} */
  const b = {
    get: k => one('readonly', s => s.get(k)),
    set: (k, v) => one('readwrite', s => s.put(v, k)).then(() => {}),
    del: k => one('readwrite', s => s.delete(k)).then(() => {}),
    // voyage complet, paquets rassemblés ; « incomplet » si un paquet annoncé manque
    readTrip: () => run([STORE, PHOTOS], 'readonly', ([vs, ps], guard) => {
      /** @type {any} */
      let out;
      const q = vs.get(KEY);
      q.onsuccess = () => guard(() => {
        const h = q.result;
        if (!isPaged(h)) { out = h; return; }
        const keys = Object.keys(h.pages).map(Number).sort((x, y) => x - y);
        /** @type {any[][]} */
        const got = new Array(keys.length);
        let missing = false;
        keys.forEach((k, i) => { const g = ps.get(k); g.onsuccess = () => { const pg = g.result; if (pg && Array.isArray(pg.photos)) got[i] = pg.photos; else missing = true; }; });
        const { pages, n, ...rest } = h;
        out = { rest, n, got, get missing() { return missing; } };
      });
      return () => {
        if (!out || !out.got) return out;
        const photos = out.got.flatMap(/** @param {any} g */ g => g || []);
        const trip = { ...out.rest, photos };
        if (out.missing || photos.length !== out.n) trip.incomplet = true;
        return trip;
      };
    }),
    // seuls les paquets dont l'empreinte a changé sont écrits ; les paquets disparus sont effacés
    writeTrip: d => run([STORE, PHOTOS], 'readwrite', ([vs, ps], guard) => {
      const s = split(d);
      if (!s) throw new Error('voyage sans numéros de photos');
      const q = vs.get(KEY);
      q.onsuccess = () => guard(() => {
        const old = q.result;
        /** @type {Record<string,string>} */
        const before = isPaged(old) ? old.pages : {};
        if (!isPaged(old)) ps.clear(); // pas d'en-tête fiable : on repart d'un magasin propre
        for (const [k, pg] of s.pages) if (before[k] !== pg.sig) ps.put(pg, k);
        for (const k of Object.keys(before)) if (!s.pages.has(Number(k))) ps.delete(Number(k));
        vs.put(s.head, KEY);
      });
      return () => undefined;
    }).then(() => {}),
    clearTrip: () => run([STORE, PHOTOS], 'readwrite', ([vs, ps]) => { vs.delete(KEY); ps.clear(); return () => undefined; }).then(() => {}),
  };
  return b;
}
