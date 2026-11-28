// @ts-check
/** Garde le voyage en cours dans le navigateur (jamais la démo, jamais dans un carnet téléchargé). */
import { $, VIEWER } from './dom.js';
import { etat } from './state.js';
import { serialize, saveTripStatus, saveMessage, loadTrip } from './store.js';
import { idbBackend } from './idb.js';

export const db = VIEWER ? null : idbBackend();
/** @type {any} */
let pending = null;
let persistAsked = false;
/** Dernière écriture (pour les tests). @type {Promise<import('./store.js').SaveStatus|'rien'>} */
export let lastWrite = Promise.resolve('rien');

/** Demande au navigateur de ne pas effacer le voyage pour faire de la place (Safari efface sinon après quelques semaines). */
function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  try { const st = navigator.storage; if (st && st.persist) st.persist().catch(() => {}); } catch { /* indisponible */ }
}

/** Sauvegarde tout de suite ; prévient si le voyage ne peut pas être gardé. */
export function keepNow() {
  clearTimeout(pending); pending = null;
  if (VIEWER || etat.isDemo || !etat.photos.length) return Promise.resolve(false);
  lastWrite = saveTripStatus(db, serialize($('title').value, etat.names, etat.photos)).then(status => {
    const w = $('keepwarn'), msg = saveMessage(status);
    w.hidden = !msg; w.textContent = msg;
    if (status === 'ok') askPersist();
    return status;
  });
  return lastWrite.then(s => s === 'ok');
}
/** Sauvegarde un peu plus tard (pendant qu'on tape un nom). */
export function keepSoon() { clearTimeout(pending); pending = setTimeout(keepNow, 400); }
// onglet caché ou fermé pendant la frappe : on n'attend pas
if (!VIEWER) document.addEventListener('visibilitychange', () => { if (document.hidden && pending) keepNow(); });
/** Le voyage gardé lors de la dernière visite, ou null. */
export const restore = () => VIEWER ? Promise.resolve(null) : loadTrip(db);
