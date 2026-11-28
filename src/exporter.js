// @ts-check
/** Téléchargement du carnet : un seul fichier HTML avec la carte et les photos. */
import { $, SHELL, VIEWER } from './dom.js';
import { etat } from './state.js';
import { serialize } from './store.js';
import { bundle } from './bundle.js';
import { carnetFileName, carnetHtml } from './carnet.js';

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
    const title = $('title').value;
    const data = {world: etat.WORLD_TXT, cities: etat.CITIES, trip: serialize(title, etat.names, etat.photos)};
    const html = carnetHtml({title, shell: SHELL, css, libs: [d3s, topo], data, app: app.code});
    etat.lastExport = html;
    const file = {filename: carnetFileName(title), data: new Blob([html], {type: 'text/html'})};
    if (etat.downloads) await etat.downloads.save(file);
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(file.data); a.download = file.filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
    b.textContent = 'Carnet téléchargé';
  } catch (/** @type {any} */ e) {
    b.textContent = e && e.code === 'declined' ? label : 'Téléchargement impossible ici';
  }
  b.disabled = false;
  setTimeout(() => { b.textContent = label; }, 3000);
});
