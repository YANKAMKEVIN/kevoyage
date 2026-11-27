// @ts-check
/** Garde le voyage en cours dans le navigateur (jamais la démo, jamais dans un carnet téléchargé). */
import { $, VIEWER } from './dom.js';
import { etat } from './state.js';
import { idbBackend, serialize, saveTrip, loadTrip } from './store.js';

export const db = VIEWER ? null : idbBackend();
/** @type {any} */
let pending = null;
/** Dernière écriture (pour les tests). @type {Promise<boolean>} */
export let lastWrite = Promise.resolve(false);

/** Sauvegarde tout de suite. */
export function keepNow() {
  clearTimeout(pending); pending = null;
  if (VIEWER || etat.isDemo || !etat.photos.length) return Promise.resolve(false);
  lastWrite = saveTrip(db, serialize($('title').value, etat.names, etat.photos));
  return lastWrite;
}
/** Sauvegarde un peu plus tard (pendant qu'on tape un nom). */
export function keepSoon() { clearTimeout(pending); pending = setTimeout(keepNow, 400); }
/** Le voyage gardé lors de la dernière visite, ou null. */
export const restore = () => VIEWER ? Promise.resolve(null) : loadTrip(db);
