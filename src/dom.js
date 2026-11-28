// @ts-check
/** Accès à la page : raccourci $, mode carnet (fichier exporté) ou appli. */

/** Version de l'appli, affichée dans le panneau. */
export const VERSION = '1.2.0';
/** @param {string} id @returns {any} */
export const $ = id => document.getElementById(id);
export const KEV = /** @type {any} */ (window).KEV || null;
export const VIEWER = !!KEV;
export const SHELL = $('app').outerHTML;
if (VIEWER) document.body.classList.add('viewer');
