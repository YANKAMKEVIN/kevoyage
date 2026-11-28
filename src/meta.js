// @ts-check
/** Données EXIF -> date et lieu d'une photo. Sans DOM, testé sous Node.
 * Les dates EXIF sont lues comme du texte (exifr avec reviveValues: false) puis vérifiées ici :
 * un appareil sans heure réglée écrit « 0000:00:00 00:00:00 » ou des blancs, que la bibliothèque
 * transformerait sinon en 1899, et un champ hors limite (mois 13) glisserait au mois suivant. */

import { parseOffset, wall } from './temps.js';

/** Options de lecture EXIF : seulement ce qui sert (date, position), valeurs brutes. */
export const EXIF_OPTS = { tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false, reviveValues: false };
/** Années acceptées pour une date de prise de vue (avant : horloge non réglée). */
export const MIN_YEAR = 1990, MAX_YEAR = 2100;

const DATE_RE = /^\s*(\d{4})[:\-/](\d{2})[:\-/](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?\s*(Z|[+-]\d{2}:?\d{2})?)?/;

/** Heure murale de prise de vue (heure lue sur l'appareil, écrite en UTC) et fuseau éventuellement écrit
 * dans le texte (« 2026-06-01T10:30:00+09:00 », fréquent en XMP), ou null si la date est absente, vide ou impossible.
 * @param {unknown} v texte EXIF « AAAA:MM:JJ HH:MM:SS » ou Date @returns {{w:number,tz:number|null}|null} */
export function exifWall(v) {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) && v.getFullYear() >= MIN_YEAR && v.getFullYear() <= MAX_YEAR ? { w: wall(t), tz: null } : null;
  }
  if (typeof v !== 'string') return null;
  const m = DATE_RE.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] || '0', m[5] || '0', m[6] || '0'].map(Number);
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const w = Date.UTC(y, mo - 1, d, h, mi, s), dt = new Date(w);
  // 31 avril, 30 février : la date glisserait au mois suivant
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { w, tz: parseOffset(m[7]) };
}

/** Heure murale -> instant lu dans le fuseau du navigateur (comportement d'avant la prise en compte des fuseaux). @param {number} w */
function browserLocal(w) {
  const d = new Date(w);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime();
}

/** Heure de prise de vue lue sur l'appareil, placée dans le fuseau du navigateur (ms), ou null si absente, vide ou impossible.
 * Le fuseau éventuel du texte est ignoré ici ; photoFields() s'en sert pour ordonner le voyage.
 * @param {unknown} v texte EXIF « AAAA:MM:JJ HH:MM:SS » ou Date @returns {number|null} */
export function exifDate(v) {
  if (v instanceof Date) { const r = exifWall(v); return r ? v.getTime() : null; }
  const r = exifWall(v);
  return r ? browserLocal(r.w) : null;
}

/** Dates EXIF par ordre de préférence, chacune avec le champ qui donne son fuseau (EXIF 2.31). */
const DATE_FIELDS = [['DateTimeOriginal', 'OffsetTimeOriginal'], ['CreateDate', 'OffsetTimeDigitized'], ['DateTimeDigitized', 'OffsetTimeDigitized'], ['ModifyDate', 'OffsetTime'], ['DateTime', 'OffsetTime']];

/** Position GPS utilisable : nombres finis, dans les bornes, et pas « 0, 0 » (valeur par défaut de certains appareils).
 * @param {unknown} lat @param {unknown} lon */
export function validGps(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

/** Champs d'une photo d'après ses données EXIF (ou null si illisibles) et la date du fichier.
 * Si le fuseau de la prise de vue est connu (OffsetTimeOriginal, ou écrit dans la date), t est l'instant réel
 * et tz le décalage en minutes ; sinon t est l'heure de l'appareil dans le fuseau du navigateur (voir temps.js).
 * Une photo sans lieu (est) reçoit 0, 0 en attendant d'être rattachée à l'étape la plus proche dans le temps.
 * @param {any} meta @param {number} lastModified
 * @returns {{t:number,noDate:boolean,lat:number,lon:number,est:boolean,tz?:number}} */
export function photoFields(meta, lastModified) {
  const m = meta && typeof meta === 'object' ? meta : {};
  /** @type {{w:number,tz:number|null}|null} */
  let r = null;
  /** @type {number|null} */
  let off = null;
  for (const [f, o] of DATE_FIELDS) { r = exifWall(m[f]); if (r) { off = r.tz ?? parseOffset(m[o]); break; } }
  const gps = validGps(m.latitude, m.longitude);
  /** @type {{t:number,noDate:boolean,lat:number,lon:number,est:boolean,tz?:number}} */
  const out = {
    t: r ? (off !== null ? r.w - off * 60000 : browserLocal(r.w)) : (Number.isFinite(lastModified) ? lastModified : 0), noDate: r === null,
    lat: gps ? m.latitude : 0, lon: gps ? m.longitude : 0, est: !gps,
  };
  if (r && off !== null) out.tz = off;
  return out;
}
