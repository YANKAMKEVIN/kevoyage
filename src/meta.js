// @ts-check
/** Données EXIF -> date et lieu d'une photo. Sans DOM, testé sous Node.
 * Les dates EXIF sont lues comme du texte (exifr avec reviveValues: false) puis vérifiées ici :
 * un appareil sans heure réglée écrit « 0000:00:00 00:00:00 » ou des blancs, que la bibliothèque
 * transformerait sinon en 1899, et un champ hors limite (mois 13) glisserait au mois suivant. */

/** Options de lecture EXIF : seulement ce qui sert (date, position), valeurs brutes. */
export const EXIF_OPTS = { tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false, reviveValues: false };
/** Années acceptées pour une date de prise de vue (avant : horloge non réglée). */
export const MIN_YEAR = 1990, MAX_YEAR = 2100;

const DATE_RE = /^\s*(\d{4})[:\-/](\d{2})[:\-/](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/;

/** Heure locale de prise de vue (ms), ou null si absente, vide ou impossible.
 * Le fuseau éventuel (« +09:00 ») est ignoré : on garde l'heure lue sur l'appareil, celle que le voyageur a vécue.
 * @param {unknown} v texte EXIF « AAAA:MM:JJ HH:MM:SS » ou Date @returns {number|null} */
export function exifDate(v) {
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) && v.getFullYear() >= MIN_YEAR && v.getFullYear() <= MAX_YEAR ? t : null;
  }
  if (typeof v !== 'string') return null;
  const m = DATE_RE.exec(v);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4] || '0', m[5] || '0', m[6] || '0'].map(Number);
  if (y < MIN_YEAR || y > MAX_YEAR || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const dt = new Date(y, mo - 1, d, h, mi, s);
  // 31 avril, 30 février : le constructeur glisserait au mois suivant
  if (dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt.getTime();
}

/** Position GPS utilisable : nombres finis, dans les bornes, et pas « 0, 0 » (valeur par défaut de certains appareils).
 * @param {unknown} lat @param {unknown} lon */
export function validGps(lat, lon) {
  return typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && !(lat === 0 && lon === 0);
}

/** Champs d'une photo d'après ses données EXIF (ou null si illisibles) et la date du fichier.
 * Une photo sans lieu (est) reçoit 0, 0 en attendant d'être rattachée à l'étape la plus proche dans le temps.
 * @param {any} meta @param {number} lastModified
 * @returns {{t:number,noDate:boolean,lat:number,lon:number,est:boolean}} */
export function photoFields(meta, lastModified) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const t = exifDate(m.DateTimeOriginal) ?? exifDate(m.CreateDate) ?? exifDate(m.DateTimeDigitized) ?? exifDate(m.ModifyDate) ?? exifDate(m.DateTime);
  const gps = validGps(m.latitude, m.longitude);
  return {
    t: t ?? (Number.isFinite(lastModified) ? lastModified : 0), noDate: t === null,
    lat: gps ? m.latitude : 0, lon: gps ? m.longitude : 0, est: !gps,
  };
}
