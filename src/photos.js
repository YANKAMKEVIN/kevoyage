// @ts-check
/** Import des photos : lecture EXIF (date, lieu), miniatures, glisser-déposer. */
import { $, VIEWER } from './dom.js';
import { etat } from './state.js';
import { autoTitle, build, estimate } from './trip.js';
import { panel } from './hud.js';
import { setPlay } from './playback.js';
import { keepNow } from './keep.js';
import { EXIF_OPTS, photoFields } from './meta.js';
import { MAX_SIDE, fitSize } from './sizes.js';
import { showThumbs } from './thumbs.js';

/* ---------- import ---------- */
function scaleToJpeg(bmp, w, h) {
  const [cw, ch] = fitSize(w, h, MAX_SIDE);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch;
  /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
function placeholder(name) {
  const c = document.createElement('canvas'); c.width = 400; c.height = 300;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')); g.fillStyle = '#dfe6f3'; g.fillRect(0, 0, 400, 300);
  g.fillStyle = '#5b6170'; g.font = '500 20px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('Aperçu indisponible', 200, 145); g.font = '15px Inter, sans-serif'; g.fillText(name.slice(0, 40), 200, 175);
  return c.toDataURL('image/jpeg', 0.8);
}
async function readFile(f) {
  let meta = null;
  try { meta = await exifr.parse(f, EXIF_OPTS); } catch (e) {}
  let src = null;
  try { src = await bitmapJpeg(f); } catch (e) {
    try { const th = await exifr.thumbnail(f); if (th) src = await bitmapJpeg(new Blob([th], {type: 'image/jpeg'})); } catch (e2) {}
  }
  if (!src) src = placeholder(f.name);
  return {id: ++etat.pid, ...photoFields(meta, f.lastModified), src};
}
/** Décode, réduit à MAX_SIDE et libère tout de suite l'image pleine taille (une photo de 12 Mpx pèse ~48 Mo décodée). @param {Blob} blob */
async function bitmapJpeg(blob) {
  const b = await createImageBitmap(blob);
  try { return scaleToJpeg(b, b.width, b.height); } finally { b.close && b.close(); }
}
export async function ingest(list) {
  const files = [...list].filter(f => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
  if (!files.length) return;
  const busy = $('busy'); busy.classList.add('on'); setPlay(false);
  const got = [];
  for (let i = 0; i < files.length; i++) {
    $('busyn').textContent = (i + 1) + ' sur ' + files.length;
    $('busyb').style.width = ((i + 1) / files.length * 100) + '%';
    try { got.push(await readFile(files[i])); } catch (e) {}
  }
  const located = got.filter(p => !p.est);
  const warn = $('warn');
  if (!located.length) {
    busy.classList.remove('on');
    warn.hidden = false;
    warn.textContent = 'Aucune de ces ' + got.length + ' photos ne contient de lieu. Les photos envoyées par WhatsApp, Messenger ou captures d\'écran perdent leur position : prenez les originaux depuis votre téléphone ou votre ordinateur (sur iPhone, AirDrop ou « Options › Toutes les données de la photo »).';
    return;
  }
  if (etat.isDemo) { etat.photos = []; etat.names = {}; etat.isDemo = false; $('title').value = ''; }
  etat.photos.push(...got);
  estimate();
  build();
  await showThumbs();
  busy.classList.remove('on');
  if (!$('title').value || $('title').dataset.auto === '1') { $('title').value = autoTitle(); $('title').dataset.auto = '1'; }
  const nE = etat.photos.filter(p => p.est).length, nD = etat.photos.filter(p => p.noDate).length;
  const msgs = [];
  if (nE) msgs.push(nE + ' photo' + (nE > 1 ? 's' : '') + ' sans lieu, placée' + (nE > 1 ? 's' : '') + ' d\'après l\'heure de prise de vue.');
  if (nD) msgs.push(nD + ' photo' + (nD > 1 ? 's' : '') + ' sans date, classée' + (nD > 1 ? 's' : '') + ' d\'après la date du fichier.');
  warn.hidden = !msgs.length; warn.textContent = msgs.join(' ');
  panel(); etat.t = 0; setPlay(true);
  keepNow();
}
$('files').addEventListener('change', e => { ingest(e.target.files); e.target.value = ''; });
if (!VIEWER) {
  window.addEventListener('dragenter', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { etat.dragN++; $('drop').classList.add('on'); } });
  window.addEventListener('dragleave', () => { etat.dragN = Math.max(0, etat.dragN - 1); if (!etat.dragN) $('drop').classList.remove('on'); });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); etat.dragN = 0; $('drop').classList.remove('on'); if (e.dataTransfer?.files?.length) ingest(e.dataTransfer.files); });
}
