// @ts-check
/** Sauvegarde versionnée du voyage en cours (titre, noms d'étapes, photos réduites),
 * dans IndexedDB (rangement par paquets : voir idb.js) : vos photos restent sur l'appareil et le voyage est retrouvé à la prochaine visite.
 * Le même format sert aux carnets téléchargés.
 *
 * Règle : toute modification du format incrémente SAVE_VERSION et ajoute une étape
 * à migrate(). Un voyage abîmé ou plus récent que l'appli n'est jamais écrasé en silence :
 * il est mis de côté sous KEY + '.abimee' et l'appli repart de la démo.
 * Les carnets exportés avant la version 1.1.0 (sans numéro de version) sont repris. */

import { KEY } from './idb.js';
import { validTz } from './temps.js';

/** Format du voyage. v2 (1.3.0) : fuseau de la prise de vue (tz, en minutes) sur les photos qui le donnent. */
export const SAVE_VERSION = 2;
/** Au-delà, la sauvegarde serait trop lourde pour la plupart des navigateurs (environ 23 Ko par photo). */
export const MAX_PHOTOS = 5000;

/** @typedef {{id:number,t:number,tz?:number,lat:number,lon:number,est:boolean,cap:string,place:string,src:string,noDate?:boolean}} SavedPhoto
 * @typedef {{version:number,title:string,names:Record<string,string>,photos:SavedPhoto[]}} SavedTrip
 * @typedef {import('./idb.js').Backend} Backend */

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isStr = (v, max) => typeof v === 'string' && v.length <= max;

/** @param {any} p @returns {p is SavedPhoto} */
export function isValidPhoto(p) {
  return !!p && typeof p === 'object' && Number.isInteger(p.id) && p.id > 0 && isNum(p.t)
    && isNum(p.lat) && p.lat >= -90 && p.lat <= 90 && isNum(p.lon) && p.lon >= -540 && p.lon <= 540
    && typeof p.est === 'boolean' && isStr(p.cap, 500) && isStr(p.place, 200)
    && typeof p.src === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p.src)
    && (p.noDate === undefined || typeof p.noDate === 'boolean') && (p.tz === undefined || validTz(p.tz));
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
  // une étape par version, dans l'ordre
  if (out.version === 1) out = { ...out, version: 2 }; // v1 -> v2 : le fuseau est facultatif, rien à convertir
  return out;
}

/** Données brutes -> voyage valide, ou null. @param {any} raw */
export function parse(raw) { const d = migrate(raw); return isValidTrip(d) ? d : null; }

/** Photos et noms de l'appli -> voyage à sauvegarder (photos rangées par numéro, comme dans la base).
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
      if (validTz(p.tz)) o.tz = p.tz;
      return o;
    }).sort((a, b) => a.id - b.id),
  };
}

/** Lit le voyage sauvegardé ; null s'il n'y en a pas, s'il est abîmé (mis de côté) ou si le stockage est bloqué.
 * @param {Backend|null} db @returns {Promise<SavedTrip|null>} */
export async function loadTrip(db) {
  if (!db) return null;
  let raw;
  try { raw = await (db.readTrip ? db.readTrip() : db.get(KEY)); } catch { return null; }
  if (raw === undefined || raw === null) return null;
  const d = raw.incomplet ? null : parse(raw);
  if (d) return d;
  try { await db.set(KEY + '.abimee', raw); await wipe(db); } catch { /* stockage plein ou bloqué : rien n'est effacé */ }
  return null;
}

/** @param {Backend} db */
const wipe = db => db.clearTrip ? db.clearTrip() : db.del(KEY);
/** @param {Backend} db @param {SavedTrip} d */
const write = (db, d) => db.writeTrip ? db.writeTrip(d) : db.set(KEY, d);

/** Résultat d'une sauvegarde : ok, trop de photos, voyage invalide (jamais écrit), stockage indisponible (navigation privée…),
 * plein (quota dépassé), ou autre erreur.
 * @typedef {'ok'|'trop'|'invalide'|'indisponible'|'plein'|'erreur'} SaveStatus */

/** Erreur de quota, quel que soit le navigateur. @param {any} e */
export function isQuotaError(e) {
  const n = e && (e.name || (e.inner && e.inner.name));
  return n === 'QuotaExceededError' || n === 'NS_ERROR_DOM_QUOTA_REACHED' || (e && e.code === 22);
}

/** Sauvegarde et dit pourquoi elle échoue. Si le stockage est plein, on libère le voyage abîmé mis de côté et on réessaie une fois.
 * @param {Backend|null} db @param {SavedTrip} d @returns {Promise<SaveStatus>} */
export async function saveTripStatus(db, d) {
  if (d && Array.isArray(d.photos) && d.photos.length > MAX_PHOTOS) return 'trop';
  if (!isValidTrip(d)) return 'invalide';
  if (!db) return 'indisponible';
  try { await write(db, d); return 'ok'; } catch (e) {
    if (!isQuotaError(e)) return 'erreur';
    try { await db.del(KEY + '.abimee'); await write(db, d); return 'ok'; } catch { return 'plein'; }
  }
}

/** @param {Backend|null} db @param {SavedTrip} d @returns {Promise<boolean>} */
export async function saveTrip(db, d) { return (await saveTripStatus(db, d)) === 'ok'; }

/** @param {Backend|null} db */
export async function clearTrip(db) { if (!db) return; try { await wipe(db); } catch { /* bloqué */ } }

/** Message pour l'utilisateur quand le voyage n'a pas pu être gardé ('' si rien à dire).
 * @param {SaveStatus} status @returns {string} */
export function saveMessage(status) {
  if (status === 'trop') return 'Ce voyage compte plus de ' + MAX_PHOTOS + ' photos : il ne peut pas être gardé dans le navigateur. Téléchargez le carnet pour le conserver.';
  if (status === 'plein') return 'Le stockage de ce navigateur est plein : votre voyage n\'a pas pu être gardé pour la prochaine visite. Téléchargez le carnet pour le conserver.';
  if (status === 'indisponible') return 'Ce navigateur ne permet pas de garder le voyage (navigation privée ?) : téléchargez le carnet pour le conserver.';
  if (status === 'erreur') return 'Votre voyage n\'a pas pu être gardé pour la prochaine visite. Téléchargez le carnet pour le conserver.';
  return '';
}
