// @ts-check
/** Miniatures rondes de la carte, faites seulement pour les photos que la carte montre (5 au plus par étape).
 * Avant la version 1.3.0, chaque photo avait la sienne : 3000 photos décodées une seconde fois à l'import
 * et au rechargement, et environ 105 Mo de pixels gardés pour rien. */
import { etat } from './state.js';
import { THUMB } from './sizes.js';

/** Miniature carrée, recadrée au centre. @param {CanvasImageSource} img @param {number} w @param {number} h */
export function thumbOf(img, w, h) {
  const c = document.createElement('canvas'); c.width = c.height = THUMB;
  const s = Math.min(w, h), g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, THUMB, THUMB);
  return c;
}
/** @type {Map<any, Promise<any>>} */
const thumbJobs = new Map();
/** Fait la miniature d'une photo (une seule fois, même si on la demande plusieurs fois). @param {any} p */
export function finishPhoto(p) {
  if (p.thumb) return Promise.resolve(p);
  const got = thumbJobs.get(p);
  if (got) return got;
  const pr = new Promise(res => {
    const im = new Image();
    im.onload = () => { p.thumb = thumbOf(im, im.naturalWidth, im.naturalHeight); res(p); };
    im.onerror = () => res(p);
    im.src = p.src;
  }).finally(() => thumbJobs.delete(p));
  thumbJobs.set(p, pr);
  return pr;
}
/** Miniatures des photos montrées par la carte (à appeler après build()) ; les autres sont libérées. */
export function showThumbs() {
  const shown = new Set();
  for (const s of etat.stops) for (const p of s.show) shown.add(p);
  for (const p of etat.photos) if (p.thumb && !shown.has(p)) delete p.thumb;
  return Promise.all([...shown].map(finishPhoto));
}
/** Redessin demandé quand une miniature arrive après coup (carte à l'arrêt). @type {() => void} */
let onLate = () => {};
/** @param {() => void} fn */
export function whenLate(fn) { onLate = fn; }
/** La carte veut une miniature qui n'est pas prête : elle sera faite, puis la carte redessinée. @param {any} p */
export function wantThumb(p) { if (!p.thumb && !thumbJobs.has(p)) finishPhoto(p).then(() => onLate()); }
