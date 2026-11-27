// @ts-check
/** Téléchargement du carnet : un seul fichier HTML avec la carte et les photos. */
import { $, SHELL, VIEWER } from './dom.js';
import { etat } from './state.js';
import { serialize } from './store.js';
import { bundle } from './bundle.js';

// hors de claude.ai (GitHub Pages, serveur local) on télécharge avec un simple lien : le bouton doit toujours être là
if (!VIEWER) $('exp').hidden = false;
const W = /** @type {any} */ (window);
if (!VIEWER && W.claude && W.claude.use) W.claude.use('downloads').then(d => { etat.downloads = d; }).catch(() => {});
$('exp').addEventListener('click', async () => {
  const b = $('exp'), label = b.textContent;
  b.textContent = 'Préparation…'; b.disabled = true;
  try {
    const get = f => fetch(f).then(r => { if (!r.ok) throw new Error(f); return r.text(); });
    const [css, d3s, topo, app] = await Promise.all([get('style.css'), get('d3.min.js'), get('topojson-client.min.js'), bundle('main.js', f => get('src/' + f))]);
    const safe = s => s.replace(/<\/script/gi, '<\\/script');
    const data = {world: etat.WORLD_TXT, cities: etat.CITIES, trip: serialize($('title').value, etat.names, etat.photos)};
    const esc = s => s.replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
    const html = '<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc($('title').value || 'Kevoyage') + '</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@600&family=Instrument+Serif&family=Inter:wght@400;500;600&display=swap"><style>' + css + '</style></head><body>' + SHELL +
      '<script>' + safe(d3s) + '</script><script>' + safe(topo) + '</script><script>window.KEV=' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script><script type="module">' + safe(app.code) + '</script></body></html>';
    etat.lastExport = html;
    const fn = ($('title').value || 'carnet').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'carnet';
    const file = {filename: 'kevoyage-' + fn + '.html', data: new Blob([html], {type: 'text/html'})};
    if (etat.downloads) await etat.downloads.save(file);
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file.data); a.download = file.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
    b.textContent = 'Carnet téléchargé';
  } catch (/** @type {any} */ e) {
    b.textContent = e && e.code === 'declined' ? label : 'Téléchargement impossible ici';
  }
  b.disabled = false;
  setTimeout(() => { b.textContent = label; }, 3000);
});
