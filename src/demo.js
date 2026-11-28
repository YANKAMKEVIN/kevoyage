// @ts-check
/** Voyage de démonstration au Japon, photos peintes sur canvas. */
import { $ } from './dom.js';
import { DAY } from './temps.js';
import { etat } from './state.js';
import { build } from './trip.js';
import { panel } from './hud.js';
import { setPlay } from './playback.js';
import { finishPhoto } from './photos.js';

/* ---------- demo ---------- */
function rnd(seed) { let s = seed % 2147483647 || 7; return () => (s = s * 16807 % 2147483647) / 2147483647; }
function sky(g, w, h, hour) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  const night = hour >= 20 || hour < 6, gold = hour >= 17 || hour < 8;
  gr.addColorStop(0, night ? '#0b1640' : gold ? '#ff8a5c' : '#5aa7f2');
  gr.addColorStop(1, night ? '#3d2c6e' : gold ? '#ffd79a' : '#d8eeff');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  return {night, gold};
}
function paint(kind, hour, seed) {
  const w = 720, h = 540, c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), r = rnd(seed * 7919 + 13), m = sky(g, w, h, hour);
  const sunY = m.gold ? 330 : 120;
  if (!m.night) { g.fillStyle = m.gold ? '#fff1c9' : '#fffbe6'; g.beginPath(); g.arc(520 + r() * 100, sunY, 46, 0, 7); g.fill(); }
  else { g.fillStyle = '#fff'; for (let i = 0; i < 60; i++) { g.globalAlpha = r(); g.fillRect(r() * w, r() * h * .6, 2, 2); } g.globalAlpha = 1; }
  const hills = (y, col, amp) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 40) g.lineTo(x, y + Math.sin(x / 90 + r() * .4) * amp); g.lineTo(w, h); g.fill(); };
  const torii = (x, y, s, col) => { g.fillStyle = col; g.fillRect(x - 70 * s, y - 150 * s, 14 * s, 150 * s); g.fillRect(x + 56 * s, y - 150 * s, 14 * s, 150 * s); g.fillRect(x - 95 * s, y - 165 * s, 190 * s, 16 * s); g.fillRect(x - 80 * s, y - 128 * s, 160 * s, 10 * s); g.fillStyle = '#222'; g.fillRect(x - 100 * s, y - 175 * s, 200 * s, 10 * s); };
  if (kind === 'plane') {
    g.fillStyle = '#e9eef6'; g.fillRect(0, 0, w, h);
    g.save(); g.beginPath(); g.ellipse(w / 2, h / 2, 190, 230, 0, 0, 7); g.clip(); sky(g, w, h, hour);
    g.fillStyle = '#fff'; for (let i = 0; i < 9; i++) { g.beginPath(); g.ellipse(r() * w, 330 + r() * 160, 90 + r() * 80, 26 + r() * 18, 0, 0, 7); g.fill(); }
    g.fillStyle = '#cfd6e2'; g.beginPath(); g.moveTo(200, 300); g.lineTo(560, 250); g.lineTo(560, 270); g.lineTo(230, 330); g.fill(); g.restore();
    g.strokeStyle = '#c3cad6'; g.lineWidth = 22; g.beginPath(); g.ellipse(w / 2, h / 2, 200, 240, 0, 0, 7); g.stroke();
  } else if (kind === 'fuji') {
    hills(330, '#8fa9d6', 6);
    g.fillStyle = '#5d79b3'; g.beginPath(); g.moveTo(120, 380); g.lineTo(330, 150); g.lineTo(390, 150); g.lineTo(620, 380); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(275, 210); g.lineTo(330, 150); g.lineTo(390, 150); g.lineTo(445, 210); for (let x = 445; x > 275; x -= 28) g.lineTo(x - 14, 196 + r() * 22); g.fill();
    hills(400, '#2f6b55', 14); g.fillStyle = m.gold ? '#f0a77b' : '#6fa3e0'; g.fillRect(0, 440, w, 100);
    g.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 14; i++) g.fillRect(r() * w, 450 + r() * 80, 40 + r() * 60, 3);
  } else if (kind === 'lake') {
    hills(300, '#7c9a6e', 18); hills(360, '#3f6b4c', 12); torii(470, 470, .8, '#e0412b');
    g.fillStyle = m.gold ? '#e79e7a' : '#4f8fd6'; g.fillRect(0, 470, w, 70);
  } else if (kind === 'sea') {
    g.fillStyle = m.gold ? '#f29a72' : '#3d7fd1'; g.fillRect(0, 330, w, 210);
    g.fillStyle = 'rgba(255,255,255,.3)'; for (let i = 0; i < 22; i++) g.fillRect(r() * w, 340 + r() * 190, 30 + r() * 70, 3);
    torii(360, 420, 1.25, '#e33b22'); g.fillStyle = 'rgba(160,30,20,.35)'; g.fillRect(270, 425, 18, 90); g.fillRect(432, 425, 18, 90);
    hills(310, '#3c5f4a', 26); g.fillStyle = m.gold ? '#f29a72' : '#3d7fd1'; g.fillRect(0, 330, w, 10);
  } else if (kind === 'temple') {
    hills(380, '#4d7a52', 16);
    const x = 360; g.fillStyle = '#8b2e24';
    for (let i = 0; i < 5; i++) { const y = 400 - i * 52, s = 1 - i * .14; g.fillStyle = '#3a2a2a'; g.beginPath(); g.moveTo(x - 120 * s, y - 20); g.quadraticCurveTo(x, y - 46, x + 120 * s, y - 20); g.lineTo(x + 90 * s, y - 34); g.lineTo(x - 90 * s, y - 34); g.fill(); g.fillStyle = '#c2412f'; g.fillRect(x - 60 * s, y - 20, 120 * s, 32); }
    g.fillStyle = '#3a2a2a'; g.fillRect(x - 3, 110, 6, 60);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#f4a9c0' : '#2f5d3f'; g.beginPath(); g.arc(r() * 160 + (i % 2 ? 520 : 40), 430 + r() * 40, 60 + r() * 30, 0, 7); g.fill(); }
    g.fillStyle = '#b8a98f'; g.fillRect(0, 500, w, 40);
  } else if (kind === 'bamboo') {
    g.fillStyle = '#cfe8b8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { const x = r() * w, s = 8 + r() * 22; g.fillStyle = `hsl(${95 + r() * 30},${40 + r() * 20}%,${22 + r() * 30}%)`; g.fillRect(x, 0, s, h); g.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 40 + r() * 60; y < h; y += 90 + r() * 30) g.fillRect(x, y, s, 4); }
    g.fillStyle = '#8f7b5d'; g.beginPath(); g.moveTo(260, h); g.lineTo(340, 330); g.lineTo(380, 330); g.lineTo(470, h); g.fill();
  } else if (kind === 'gates') {
    g.fillStyle = '#2b1a14'; g.fillRect(0, 0, w, h);
    for (let i = 9; i >= 0; i--) { const s = 1 - i * .085, cx = 360 + i * 6; g.fillStyle = i % 2 ? '#e5482c' : '#f0582f'; g.fillRect(cx - 230 * s, 270 - 230 * s, 40 * s, 520 * s); g.fillRect(cx + 190 * s, 270 - 230 * s, 40 * s, 520 * s); g.fillStyle = '#1b1210'; g.fillRect(cx - 260 * s, 270 - 250 * s, 520 * s, 30 * s); }
    g.fillStyle = '#d8c7a5'; g.beginPath(); g.moveTo(180, h); g.lineTo(330, 300); g.lineTo(410, 300); g.lineTo(560, h); g.fill();
  } else if (kind === 'deer') {
    hills(360, '#6f9a58', 10); g.fillStyle = '#8fbf6a'; g.fillRect(0, 430, w, 110);
    for (let i = 0; i < 4; i++) { g.fillStyle = '#2f5d3f'; g.beginPath(); g.arc(60 + i * 200 + r() * 60, 300, 70 + r() * 30, 0, 7); g.fill(); }
    const dx = 330, dy = 400; g.fillStyle = '#a8703f';
    g.beginPath(); g.ellipse(dx, dy, 90, 42, 0, 0, 7); g.fill();
    g.fillRect(dx - 70, dy + 20, 12, 80); g.fillRect(dx - 40, dy + 20, 12, 84); g.fillRect(dx + 40, dy + 20, 12, 84); g.fillRect(dx + 66, dy + 20, 12, 80);
    g.beginPath(); g.moveTo(dx + 60, dy - 20); g.lineTo(dx + 110, dy - 110); g.lineTo(dx + 140, dy - 100); g.lineTo(dx + 95, dy - 10); g.fill();
    g.beginPath(); g.ellipse(dx + 140, dy - 112, 34, 20, -.3, 0, 7); g.fill();
    g.fillStyle = '#f4e6d0'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(dx - 60 + r() * 110, dy - 20 + r() * 30, 5, 0, 7); g.fill(); }
    g.fillStyle = '#1d1d1d'; g.beginPath(); g.arc(dx + 150, dy - 116, 4, 0, 7); g.fill();
  } else if (kind === 'street') {
    g.fillStyle = m.night ? '#1a1430' : '#5b4a6e'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { g.fillStyle = `hsl(${r() * 360},70%,${m.night ? 55 : 65}%)`; g.fillRect(r() * w, 40 + r() * 200, 30 + r() * 50, 90 + r() * 120); }
    g.fillStyle = '#2a2235'; g.fillRect(0, 0, 110, h); g.fillRect(w - 110, 0, 110, h);
    for (let i = 0; i < 7; i++) { const y = 120 + i * 50, s = 1 - i * .1; for (const x of [140 + i * 22, w - 140 - i * 22]) { g.fillStyle = 'rgba(255,90,60,.35)'; g.beginPath(); g.arc(x, y, 40 * s, 0, 7); g.fill(); g.fillStyle = i % 2 ? '#ff5a36' : '#fff0d8'; g.beginPath(); g.ellipse(x, y, 20 * s, 28 * s, 0, 0, 7); g.fill(); } }
    g.fillStyle = '#3b3346'; g.beginPath(); g.moveTo(120, h); g.lineTo(330, 300); g.lineTo(390, 300); g.lineTo(600, h); g.fill();
  } else {
    hills(440, m.night ? '#1b1d3a' : '#7a8fb5', 4);
    for (let i = 0; i < 22; i++) {
      const bw = 30 + r() * 50, bh = 80 + r() * 300, x = i * 34 - 20 + r() * 10;
      g.fillStyle = m.night ? `hsl(240,25%,${12 + r() * 10}%)` : `hsl(215,${15 + r() * 15}%,${45 + r() * 25}%)`;
      g.fillRect(x, h - 60 - bh, bw, bh);
      g.fillStyle = m.night ? '#ffd97a' : 'rgba(255,255,255,.45)';
      for (let yy = h - 50 - bh; yy < h - 70; yy += 14) for (let xx = x + 5; xx < x + bw - 6; xx += 10) if (r() < (m.night ? .45 : .3)) g.fillRect(xx, yy, 5, 7);
    }
    if (m.night) { for (let i = 0; i < 5; i++) { g.fillStyle = ['#ff4f8b', '#4fd2ff', '#ffe14f', '#7dff8a', '#ff7a3c'][i]; g.fillRect(40 + i * 140, 300 + r() * 60, 70, 18); } }
    g.fillStyle = m.night ? '#14152b' : '#55607a'; g.fillRect(0, h - 60, w, 60);
  }
  return c.toDataURL('image/jpeg', 0.84);
}
/** [jour, heure, lat, lon, décor, légende, lieu] @type {[number,string,number,number,string,string,string][]} */
const DEMO = [
  // day, time, lat, lon, kind, caption, place
  [0, '09:40', 49.009, 2.548, 'plane', 'Décollage de Roissy', 'Paris'],
  [1, '18:30', 35.659, 139.700, 'city', 'Shibuya au crépuscule', 'Tokyo'],
  [2, '08:10', 35.715, 139.797, 'temple', 'Sensō-ji avant la foule', 'Tokyo'],
  [2, '13:00', 35.671, 139.765, 'street', 'Ruelles de Yūrakuchō', 'Tokyo'],
  [2, '21:15', 35.694, 139.703, 'city', 'Shinjuku, néons', 'Tokyo'],
  [3, '10:20', 35.676, 139.699, 'bamboo', 'Forêt du Meiji-jingū', 'Tokyo'],
  [4, '09:50', 35.204, 139.025, 'fuji', 'Le Fuji depuis le lac Ashi', 'Hakone'],
  [4, '16:40', 35.205, 139.026, 'lake', 'Torii flottant de Hakone', 'Hakone'],
  [5, '17:20', 34.995, 135.785, 'temple', 'Kiyomizu-dera', 'Kyoto'],
  [6, '07:30', 35.017, 135.672, 'bamboo', 'Arashiyama à l\'aube', 'Kyoto'],
  [6, '11:00', 34.967, 135.773, 'gates', 'Mille torii à Fushimi Inari', 'Kyoto'],
  [6, '20:30', 35.004, 135.775, 'street', 'Lanternes de Gion', 'Kyoto'],
  [7, '10:00', 34.685, 135.843, 'deer', 'Les daims de Nara', 'Nara'],
  [7, '13:30', 34.689, 135.840, 'temple', 'Tōdai-ji', 'Nara'],
  [7, '20:45', 34.669, 135.501, 'street', 'Dōtonbori', 'Osaka'],
  [8, '11:00', 34.687, 135.526, 'city', 'Vue sur Osaka', 'Osaka'],
  [9, '12:30', 34.296, 132.320, 'sea', 'Itsukushima, marée haute', 'Miyajima'],
  [9, '18:10', 34.297, 132.319, 'sea', 'Le grand torii au couchant', 'Miyajima'],
  [10, '09:00', 34.395, 132.453, 'city', 'Hiroshima, dernier matin', 'Hiroshima']
];
/**
 * Photo peinte avec Codex (art/demo_NN.webp), convertie en JPEG intégré pour que le carnet
 * exporté reste un seul fichier. Si elle ne se charge pas, la photo dessinée prend le relais.
 * @param {number} i @param {() => string} fallback @returns {Promise<string>}
 */
function painted(i, fallback) {
  return new Promise(res => {
    const im = new Image();
    im.onload = () => {
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(im, 0, 0);
      demoArt++; res(c.toDataURL('image/jpeg', 0.84));
    };
    im.onerror = () => res(fallback());
    im.src = `art/demo_${String(i + 1).padStart(2, '0')}.webp`;
  });
}
/** Nombre de photos peintes chargées pour la démo (vérifié par les tests). */
export let demoArt = 0;
export async function loadDemo() {
  demoArt = 0;
  const base = new Date(2026, 4, 2).getTime();
  etat.photos = await Promise.all(DEMO.map((d, i) => {
    const [hh, mm] = d[1].split(':').map(Number);
    const tm = base + d[0] * DAY + (hh * 60 + mm) * 6e4;
    return (async () => finishPhoto({id: ++etat.pid, t: tm, lat: d[2], lon: d[3], est: false, cap: d[5], place: d[6], src: await painted(i, () => paint(d[4], hh, i + 3))}))();
  }));
  etat.names = {}; etat.isDemo = true; $('title').value = 'Japon, mai 2026'; $('title').dataset.auto = ''; $('warn').hidden = true;
  build(); panel(); etat.t = 0;
}
$('demo').addEventListener('click', async () => { await loadDemo(); setPlay(true); });
