// @ts-check
/** Point d'entrée : couleurs, redimensionnement, démarrage. */
import { $, KEV, VERSION } from './dom.js';
import { parse } from './store.js';
import { keepNow, lastWrite, restore } from './keep.js';
import { cv, draw, loadGeo, probe, readColors, resize } from './map.js';
import { etat } from './state.js';
import { build } from './trip.js';
import { panel } from './hud.js';
import { setPlay, startLoop } from './playback.js';
import { ingest } from './photos.js';
import { showThumbs } from './thumbs.js';
import { loadDemo, demoArt } from './demo.js';
import './exporter.js';

document.body.appendChild(probe);
/* ---------- boot ---------- */
readColors();
new MutationObserver(() => { readColors(); draw(); }).observe(document.documentElement, {attributes: true, attributeFilter: ['data-theme', 'class']});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
const ro = new ResizeObserver(() => resize());
ro.observe(cv);
/** Ouvre un voyage sauvegardé ou un carnet. @param {import('./store.js').SavedTrip} trip */
async function openTrip(trip) {
  etat.names = { ...trip.names }; etat.isDemo = false;
  etat.photos = trip.photos.map(p => { etat.pid = Math.max(etat.pid, p.id); return { ...p }; });
  $('title').value = trip.title; $('title').dataset.auto = ''; build(); await showThumbs(); panel();
}

$('ver').textContent = 'v' + VERSION;
(async () => {
  await loadGeo();
  if (KEV) {
    const trip = parse(KEV.trip);
    if (trip) await openTrip(trip);
    else { const w = $('warn'); w.hidden = false; w.textContent = 'Ce carnet est abîmé ou vient d\'une version plus récente de Kevoyage : impossible de l\'ouvrir.'; panel(); }
  } else {
    const saved = await restore();
    if (saved) { await openTrip(saved); const w = $('warn'); w.hidden = false; w.textContent = 'Votre dernier voyage a été retrouvé. « Voir la démo » puis « Ajouter mes photos » pour en commencer un autre.'; }
    else await loadDemo();
  }
  resize();
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setPlay(true);
  else { const o = etat.seq.find(q => q.kind === 'stay' && q.s.i === Math.min(2, etat.stops.length - 1)); if (o) etat.t = o.t0 + 0.1; }
  startLoop(); draw();
  etat.ready = true;
})();

/** Accès pour les tests de bout en bout. */
Object.assign(window, { __kv: { etat, ingest, keep: () => keepNow(), keepStatus: () => lastWrite, restore, get demoArt() { return demoArt; } } });
