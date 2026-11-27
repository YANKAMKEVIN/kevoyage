// @ts-check
/** Lecture, pause, vitesse, barre de défilement, clavier. */
import { $, VIEWER } from './dom.js';
import { etat } from './state.js';
import { draw } from './map.js';
import { fitTitle } from './hud.js';
import { keepSoon } from './keep.js';

/* ---------- playback ---------- */
const pico = $('pico');
export function setPlay(on) {
  etat.playing = on && etat.stops.length > 0;
  if (etat.playing && etat.t >= etat.T - 0.01) etat.t = 0;
  pico.setAttribute('d', etat.playing ? 'M4 3h4v14H4zM12 3h4v14h-4z' : 'M5 3l12 7-12 7z');
  $('play').setAttribute('aria-label', etat.playing ? 'Pause' : 'Lecture');
  etat.last = performance.now();
}
export function loop(now) {
  const dt = Math.min(0.1, (now - etat.last) / 1000); etat.last = now;
  if (etat.playing) { etat.t += dt * etat.speed; if (etat.t >= etat.T) { etat.t = etat.T; setPlay(false); } }
  draw();
  requestAnimationFrame(loop);
}
$('play').addEventListener('click', () => setPlay(!etat.playing));
$('speed').addEventListener('click', () => { etat.speed = etat.speed === 1 ? 2 : etat.speed === 2 ? 4 : 1; $('speed').textContent = '×' + etat.speed; });
$('scrub').addEventListener('input', e => { etat.t = /** @type {any} */ (e.target).value / 1000 * etat.T; etat.hash = null; draw(); });
document.addEventListener('keydown', e => {
  const tg = /** @type {any} */ (e.target);
  if (tg.tagName === 'INPUT' && tg.type !== 'range') return;
  if (e.code === 'Space' && tg.tagName !== 'BUTTON') { e.preventDefault(); setPlay(!etat.playing); }
});
$('title').addEventListener('input', () => { etat.hash = null; fitTitle(); $('title').dataset.auto = ''; keepSoon(); });
if (VIEWER) $('title').readOnly = true;
