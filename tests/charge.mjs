// Test de charge dans Chromium : un voyage de 3000 photos synthétiques (date, fuseau et position dans l'EXIF).
// Mesure le temps d'import, la mémoire, la sauvegarde (complète puis après un renommage), le rechargement
// et la fluidité, et échoue au-delà de seuils larges (garde-fou contre les régressions, pas un banc d'essai).
// Lancer : npm run charge   (CHARGE_N=1000 pour un autre nombre de photos)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withExif } from './exif.mjs';

const N = Number(process.env.CHARGE_N) || 3000;
// seuils larges (la machine de CI est partagée) ; mesuré sur 4 cœurs : ~12 ms par photo à l'import,
// ~14 ms pour garder un renommage avec 3000 photos (la version 1.2 réécrivait tout : ~125 ms pour 1500 photos)
const LIMITS = { importMsPerPhoto: 120, heapMb: 400, saveMs: 20000, renameMs: 500, reloadS: 90, fps: 5 };
const PORT = 5200 + Math.floor(Math.random() * 800);
const URL = `http://127.0.0.1:${PORT}/index.html`;
const OUT = process.env.SMOKE_SHOTS || 'test-results';
const DIR = join(OUT, 'charge-photos');
rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 100; i++) {
  const ok = await new Promise(res => { const c = connect(PORT, '127.0.0.1', () => { c.end(); res(true); }); c.on('error', () => res(false)); });
  if (ok) break; await sleep(100);
}
const fails = [], mesures = {};
const check = (ok, msg) => { console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); if (!ok) fails.push(msg); };
const ready = page => page.waitForFunction(() => window.__kv && __kv.etat.ready, null, { timeout: 120000 });
const p2 = n => String(n).padStart(2, '0');

// tour du monde vers l'est, 30 villes, 100 photos par ville, 20 par jour, heures locales qui sautent avec les fuseaux ; une photo sur 10 sans lieu, une sur 25 sans fuseau
const CITIES = [[48.8566, 2.3522, 2], [52.52, 13.405, 2], [50.0755, 14.4378, 2], [47.4979, 19.0402, 2], [44.4268, 26.1025, 3], [41.0082, 28.9784, 3],
  [40.1792, 44.4991, 4], [41.7151, 44.8271, 4], [38.5598, 68.787, 5], [41.2995, 69.2401, 5], [28.6139, 77.209, 5.5], [27.7172, 85.324, 5.75],
  [23.8103, 90.4125, 6], [13.7563, 100.5018, 7], [21.0278, 105.8342, 7], [22.3193, 114.1694, 8], [25.033, 121.5654, 8], [37.5665, 126.978, 9],
  [35.6762, 139.6503, 9], [34.6937, 135.5023, 9], [-33.8688, 151.2093, 10], [-36.8485, 174.7633, 12], [21.3069, -157.8583, -10], [37.7749, -122.4194, -7],
  [34.0522, -118.2437, -7], [39.7392, -104.9903, -6], [41.8781, -87.6298, -5], [40.7128, -74.006, -4], [45.5017, -73.5673, -4], [38.7223, -9.1393, 1]];
const exifOf = i => {
  // instant réel croissant (une photo toutes les 72 min), heure locale = instant + fuseau de la ville
  const c = CITIES[Math.floor(i * CITIES.length / N)], off = c[2], sign = off < 0 ? '-' : '+', a = Math.abs(off);
  const d = new Date(Date.UTC(2026, 5, 1, 6) + i * 72 * 6e4 + off * 36e5);
  const o = { date: `${d.getUTCFullYear()}:${p2(d.getUTCMonth() + 1)}:${p2(d.getUTCDate())} ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}:00` };
  if (i % 25 !== 3) o.offset = `${sign}${p2(Math.floor(a))}:${p2((a % 1) * 60)}`;
  if (i % 10 !== 5) { o.lat = c[0] + (i % 7) * 0.002; o.lon = c[1] + (i % 5) * 0.002; }
  return o;
};

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(URL); await ready(page);

  // photos JPEG 800 × 600 peintes dans le navigateur, écrites sur disque (trop lourdes pour passer en mémoire)
  const paths = [];
  for (let from = 0; from < N; from += 250) {
    const n = Math.min(250, N - from);
    const b64s = await page.evaluate(([from, n]) => Array.from({ length: n }, (_, k) => {
      const i = from + k, cv = document.createElement('canvas'); cv.width = 800; cv.height = 600; const g = cv.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 800, 600); gr.addColorStop(0, `hsl(${i * 37 % 360},70%,55%)`); gr.addColorStop(1, '#123');
      g.fillStyle = gr; g.fillRect(0, 0, 800, 600); g.fillStyle = '#fff'; g.font = '120px sans-serif'; g.fillText(String(i + 1), 60, 330);
      return cv.toDataURL('image/jpeg', .75).split(',')[1];
    }), [from, n]);
    b64s.forEach((b, k) => { const f = join(DIR, `photo-${from + k + 1}.jpg`); writeFileSync(f, withExif(Buffer.from(b, 'base64'), exifOf(from + k))); paths.push(f); });
  }

  // ---------- import ----------
  const t0 = Date.now();
  await page.setInputFiles('#files', paths);
  await page.waitForFunction(n => !__kv.etat.isDemo && __kv.etat.photos.length === n && !document.getElementById('busy').classList.contains('on'), N, { timeout: 900000, polling: 500 });
  const importS = (Date.now() - t0) / 1000;
  mesures.importS = importS; mesures.importMsPerPhoto = importS * 1000 / N;
  const r = await page.evaluate(() => {
    const e = __kv.etat;
    let sorted = true;
    for (let i = 1; i < e.photos.length; i++) if (e.photos[i].t < e.photos[i - 1].t) sorted = false;
    return { stops: e.stops.length, tz: e.photos.filter(p => typeof p.tz === 'number').length, thumbs: e.photos.filter(p => p.thumb).length, sorted, days: e.day1 - e.day0 + 1 };
  });
  check(r.stops === CITIES.length && r.sorted, `${N} photos : ${r.stops} étapes, dans l'ordre réel malgré les fuseaux`);
  check(r.tz === N, `${N} photos : chaque photo a un fuseau (les ${Math.ceil(N / 25)} sans fuseau l'ont reçu de leurs voisines)`);
  check(mesures.importMsPerPhoto < LIMITS.importMsPerPhoto, `import : ${importS.toFixed(1)} s, soit ${mesures.importMsPerPhoto.toFixed(1)} ms par photo (seuil ${LIMITS.importMsPerPhoto})`);
  mesures.thumbs = r.thumbs;

  // ---------- mémoire ----------
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const heapMb = (await cdp.send('Runtime.getHeapUsage')).usedSize / 1048576;
  mesures.heapMb = heapMb;
  mesures.thumbsMb = r.thumbs * 96 * 96 * 4 / 1048576;
  check(heapMb < LIMITS.heapMb, `mémoire JavaScript après import : ${heapMb.toFixed(0)} Mo (seuil ${LIMITS.heapMb})`);
  console.log(`      miniatures de la carte en mémoire : ${r.thumbs} (${mesures.thumbsMb.toFixed(0)} Mo de pixels)`);

  // ---------- sauvegarde ----------
  // la sauvegarde complète part à la fin de l'import : on attend son résultat
  const status = await page.evaluate(() => __kv.keepStatus());
  check(status === 'ok', `voyage de ${N} photos gardé (${status})`);
  // lecture en pause : on mesure la sauvegarde, pas l'attente derrière les images de l'animation
  await page.evaluate(() => { if (__kv.etat.playing) document.getElementById('play').click(); });
  mesures.photosMo = await page.evaluate(() => __kv.etat.photos.reduce((a, p) => a + p.src.length, 0) / 1048576);
  console.log(`      poids des photos gardées : ${mesures.photosMo.toFixed(0)} Mo`);
  const save = await page.evaluate(async () => { const t = performance.now(); const ok = await __kv.keep(); return { ok, ms: performance.now() - t }; });
  mesures.fullSaveMs = save.ms;
  const rename = await page.evaluate(async () => {
    const inp = document.getElementById('stop-3'); inp.value = 'Istanbul la nuit'; inp.dispatchEvent(new Event('input'));
    const t = performance.now(); const ok = await __kv.keep(); return { ok, ms: performance.now() - t };
  });
  mesures.renameMs = rename.ms;
  check(save.ok && save.ms < LIMITS.saveMs, `sauvegarde sans changement de photo : ${save.ms.toFixed(0)} ms`);
  check(rename.ok && rename.ms < LIMITS.renameMs, `sauvegarde après un renommage d'étape : ${rename.ms.toFixed(0)} ms (seuil ${LIMITS.renameMs})`);

  // ---------- fluidité ----------
  await page.evaluate(() => { if (!__kv.etat.playing) document.getElementById('play').click(); });
  const f0 = await page.evaluate(() => __kv.etat.frames); await sleep(2000);
  const fps = (await page.evaluate(() => __kv.etat.frames) - f0) / 2;
  mesures.fps = fps;
  check(fps >= LIMITS.fps, `lecture avec ${N} photos : ${fps.toFixed(0)} images/s (seuil ${LIMITS.fps})`);

  // ---------- rechargement ----------
  const tr = Date.now();
  await page.reload(); await ready(page);
  mesures.reloadS = (Date.now() - tr) / 1000;
  const back = await page.evaluate(() => ({ n: __kv.etat.photos.length, demo: __kv.etat.isDemo, name: __kv.etat.stops[3] && __kv.etat.stops[3].name, stops: __kv.etat.stops.length }));
  check(!back.demo && back.n === N && back.stops === CITIES.length && back.name === 'Istanbul la nuit', `rechargement : ${back.n} photos et le nom renommé retrouvés en ${mesures.reloadS.toFixed(1)} s (seuil ${LIMITS.reloadS})`);
  check(mesures.reloadS < LIMITS.reloadS, 'rechargement dans le seuil');
  await cdp.detach().catch(() => {});
  const cdp2 = await ctx.newCDPSession(page);
  await cdp2.send('HeapProfiler.collectGarbage');
  mesures.heapReloadMb = (await cdp2.send('Runtime.getHeapUsage')).usedSize / 1048576;
  mesures.thumbsReload = await page.evaluate(() => __kv.etat.photos.filter(p => p.thumb).length);
  console.log(`      après rechargement : ${mesures.heapReloadMb.toFixed(0)} Mo de mémoire JavaScript, ${mesures.thumbsReload} miniatures`);
  await page.screenshot({ path: `${OUT}/charge-${N}.png` });
  check(errs.length === 0, `aucune erreur (${errs.slice(0, 2).join(' | ')})`);
  writeFileSync(join(OUT, 'charge.json'), JSON.stringify({ N, ...mesures }, null, 1));
  console.log('      mesures : ' + JSON.stringify(Object.fromEntries(Object.entries(mesures).map(([k, v]) => [k, Math.round(v * 10) / 10]))));
} finally {
  await browser.close();
  server.kill();
  rmSync(DIR, { recursive: true, force: true });
}
if (fails.length) { console.error(`\n${fails.length} échec(s)`); process.exit(1); }
console.log(`\nCharge de ${N} photos : tout est bon.`);
