// @ts-check
/** Heures et jours du voyage, dans le fuseau de chaque prise de vue. Sans DOM, testé sous Node.
 *
 * Une photo garde `t`, l'instant de la prise de vue en millisecondes, qui sert à ordonner le voyage.
 * Si le fuseau de la prise de vue est connu (`tz`, en minutes, lu dans OffsetTimeOriginal), `t` est
 * l'instant réel, et l'heure vécue sur place est t + tz. Sinon, `t` est l'heure lue sur l'appareil,
 * placée dans le fuseau du navigateur, comme avant la version 1.3.0.
 *
 * Les jours et les heures affichés viennent de l'« heure murale » : l'heure vécue sur place,
 * écrite comme si elle était en UTC. Deux photos d'une même journée à Tokyo restent le même jour,
 * même si le carnet est ouvert à Paris, et un jour de changement d'heure compte pour un jour. */

export const DAY = 864e5;
/** Fuseaux possibles : de UTC−12:00 à UTC+14:00. */
export const TZ_MIN = -720, TZ_MAX = 840;

/** Décalage EXIF (« +09:00 », « -05:30 », « +0545 », « Z ») en minutes, ou null s'il est absent ou impossible.
 * @param {unknown} v @returns {number|null} */
export function parseOffset(v) {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\0/g, '').trim();
  if (s === 'Z') return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[2]), mi = Number(m[3]);
  if (mi % 15 !== 0 || mi > 45) return null;
  const tz = (m[1] === '-' ? -1 : 1) * (h * 60 + mi);
  return validTz(tz) ? tz : null;
}

/** @param {unknown} tz @returns {tz is number} */
export function validTz(tz) { return Number.isInteger(tz) && /** @type {number} */ (tz) >= TZ_MIN && /** @type {number} */ (tz) <= TZ_MAX; }

/** Heure murale (heure vécue sur place, écrite en UTC) d'une photo, ou d'un instant lu dans le fuseau du navigateur.
 * @param {number|{t:number,tz?:number}} x @returns {number} */
export function wall(x) {
  if (typeof x === 'number') {
    const d = new Date(x);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  }
  return validTz(x.tz) ? x.t + x.tz * 60000 : wall(x.t);
}

/** Numéro du jour d'une heure murale. @param {number} w */
export function wallDay(w) { return Math.floor(w / DAY); }

/** Numéro du jour calendaire vécu sur place (entier, sans effet des changements d'heure). @param {number|{t:number,tz?:number}} x */
export function dayIndex(x) { return wallDay(wall(x)); }

/** Jours calendaires entre deux photos (ou instants), chacune dans son fuseau. */
export function daysBetween(/** @type {number|{t:number,tz?:number}} */ a, /** @type {number|{t:number,tz?:number}} */ b) { return dayIndex(b) - dayIndex(a); }

/** Photos sans fuseau (vieil appareil, ou deux téléphones dont un seul l'écrit) : elles prennent le fuseau
 * d'une photo à fuseau connu proche dans le temps, pour être bien ordonnées avec les autres.
 * Si la photo a un lieu et qu'une distance est fournie, on préfère la plus proche dans le temps prise à moins
 * de NEAR_KM (juste après avoir franchi la ligne de changement de date, l'heure locale de la veille se
 * confond avec celle d'Auckland : seul le lieu tranche). L'heure affichée ne change pas.
 * Les photos « sans date » (datées par le fichier) ne sont pas touchées.
 * Ne fait rien si aucune photo n'a de fuseau. Renvoie le nombre de photos complétées.
 * @template {{t:number,tz?:number,noDate?:boolean,est?:boolean,lat?:number,lon?:number}} P
 * @param {P[]} photos @param {(a:P,b:P)=>number} [dist] distance en km */
export function inferZones(photos, dist) {
  const known = photos.filter(p => validTz(p.tz) && !p.noDate).map(p => ({ w: wall(p), p })).sort((a, b) => a.w - b.w);
  if (!known.length) return 0;
  let n = 0;
  for (const p of photos) {
    if (validTz(p.tz) || p.noDate) continue;
    const w = wall(p.t);
    // recherche dichotomique de la première photo connue à w ou après
    let lo = 0, hi = known.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (known[mid].w < w) lo = mid + 1; else hi = mid; }
    const a = known[lo - 1], b = known[lo];
    let k = a && b ? (w - a.w <= b.w - w ? a : b) : (a || b);
    if (dist && !p.est) {
      // en s'éloignant dans le temps des deux côtés, la première photo prise près d'ici
      for (let i = lo - 1, j = lo, steps = 0; (i >= 0 || j < known.length) && steps < NEAR_SCAN; steps++) {
        const left = i >= 0 ? known[i] : null, right = j < known.length ? known[j] : null;
        const c = left && right ? (w - left.w <= right.w - w ? left : right) : /** @type {{w:number,p:P}} */ (left || right);
        if (c === left) i--; else j++;
        if (!c.p.est && dist(c.p, p) < NEAR_KM) { k = c; break; }
      }
    }
    const tz = /** @type {number} */ (k.p.tz);
    p.tz = tz; p.t = w - tz * 60000; n++;
  }
  return n;
}
/** Distance sous laquelle une photo voisine donne son fuseau, et nombre de voisines examinées au plus. */
export const NEAR_KM = 300, NEAR_SCAN = 400;
