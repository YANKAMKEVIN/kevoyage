// @ts-check
/** Tailles des images gardées : photo réduite (affichée, sauvegardée, exportée) et miniature ronde de la carte. Sans DOM. */

/** Plus grand côté d'une photo importée, en pixels. */
export const MAX_SIDE = 1000;
/** Côté de la miniature ronde dessinée sur la carte : 22 px de rayon au plus, × DPR plafonné à 2. */
export const THUMB = 96;

/** Dimensions réduites pour tenir dans max × max, sans jamais agrandir ; au moins 1 px.
 * @param {number} w @param {number} h @param {number} max @returns {[number, number]} */
export function fitSize(w, h, max) {
  if (!(w > 0) || !(h > 0)) return [1, 1];
  const s = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}
