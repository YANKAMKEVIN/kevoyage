// @ts-check
/** Le carnet téléchargé : un seul fichier HTML autonome (styles, bibliothèques, données et appli en ligne). Sans DOM. */

/** Polices du carnet (seule ressource externe ; sans réseau, le navigateur prend les polices système). */
export const FONTS = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Instrument+Serif&family=Inter:wght@400;500;600&display=swap';

/** Échappe un texte pour le HTML. @param {string} s */
export function escHtml(s) { return String(s).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';'); }
/** Un script en ligne ne doit jamais fermer sa balise par erreur. @param {string} s */
export function safeScript(s) { return s.replace(/<\/(script)/gi, '<\\/$1'); }
/** Données en JSON lisibles dans un script en ligne : « < » encodé, séparateurs de ligne JS encodés.
 * @param {any} data */
export function inlineJson(data) { return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }

/** Nom du fichier téléchargé : « kevoyage-<titre sans accents>.html ». @param {string} title */
export function carnetFileName(title) {
  const fn = String(title || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 80).replace(/-$/, '');
  return 'kevoyage-' + (fn || 'carnet') + '.html';
}

/** Assemble le carnet.
 * @param {{title:string, shell:string, css:string, libs:string[], data:any, app:string}} o
 *  shell : le HTML de l'appli (#app), libs : scripts classiques (d3, topojson), data : window.KEV, app : modules rassemblés
 * @returns {string} */
export function carnetHtml({ title, shell, css, libs, data, app }) {
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + escHtml(title || 'Kevoyage') + '</title>'
    + '<link rel="stylesheet" href="' + FONTS + '"><style>' + css.replace(/<\/style/gi, '<\\/style') + '</style></head><body>' + shell
    + libs.map(l => '<script>' + safeScript(l) + '</script>').join('')
    + '<script>window.KEV=' + inlineJson(data) + '</script><script type="module">' + safeScript(app) + '</script></body></html>';
}
