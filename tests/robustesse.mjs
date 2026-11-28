// Robustesse et performance dans un vrai navigateur (Chromium) :
// vitesse de lecture, onglet caché, aucun dessin à l'arrêt, dates EXIF bizarres, navigation privée,
// stockage plein, base de la version 1.2 (montée de schéma), 300 photos (réduction, mémoire, fluidité, rechargement), carnet ouvert sur téléphone.
// Lancer : npm run robustesse
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { mkdirSync } from 'node:fs';
import { withExif } from './exif.mjs';

// port pris au hasard entre 5200 et 5999 (plusieurs projets testés en même temps sur la machine)
const PORT = 5200 + Math.floor(Math.random() * 800);
const URL = `http://127.0.0.1:${PORT}/index.html`;
const OUT = process.env.SMOKE_SHOTS || 'test-results';
mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
for (let i = 0; i < 100; i++) {
  const ok = await new Promise(res => { const c = connect(PORT, '127.0.0.1', () => { c.end(); res(true); }); c.on('error', () => res(false)); });
  if (ok) break; await sleep(100);
}
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? 'OK   ' : 'ÉCHEC'} ${msg}`); if (!ok) fails.push(msg); };
const ready = page => page.waitForFunction(() => window.__kv && __kv.etat.ready, null, { timeout: 30000 });
const watch = page => { const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); return errs; };

/** Photos JPEG peintes dans le navigateur (w × h), avec EXIF. @param {{date?:string,lat?:number,lon?:number}[]} exifs */
async function makePhotos(page, exifs, w = 320, h = 240) {
  const b64s = await page.evaluate(([n, w, h]) => Array.from({ length: n }, (_, i) => {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d');
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, `hsl(${i * 37 % 360},70%,55%)`); gr.addColorStop(1, '#123');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.font = `${h / 4}px sans-serif`; g.fillText(String(i + 1), w / 10, h / 2);
    return cv.toDataURL('image/jpeg', .7).split(',')[1];
  }), [exifs.length, w, h]);
  return b64s.map((b, i) => ({ name: `photo-${i + 1}.jpg`, mimeType: 'image/jpeg', buffer: exifs[i] ? withExif(Buffer.from(b, 'base64'), exifs[i]) : Buffer.from(b, 'base64') }));
}
const trip3 = [
  { date: '2026:06:01 10:30:00', lat: 38.7223, lon: -9.1393 },
  { date: '2026:06:03 17:00:00', lat: 41.1579, lon: -8.6291 },
  { date: '2026:06:05 20:00:00', lat: 40.4168, lon: -3.7038 },
];
const importAndWait = async (page, files, n) => {
  await page.setInputFiles('#files', files);
  await page.waitForFunction(n => !__kv.etat.isDemo && __kv.etat.photos.length === n && !document.getElementById('busy').classList.contains('on'), n, { timeout: 120000 });
};

const browser = await chromium.launch();
try {
  // ---------- lecture : vitesse, arrêt, onglet caché ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage(); const errs = watch(page);
    await page.goto(URL); await ready(page);
    const rate = async () => { const a = await page.evaluate(() => __kv.etat.t); await sleep(1000); return (await page.evaluate(() => __kv.etat.t)) - a; };
    await sleep(500); await page.evaluate(() => { __kv.etat.t = 0; });
    const r1 = await rate();
    await page.click('#speed'); await page.click('#speed');
    const r4 = await rate();
    check(await page.evaluate(() => __kv.etat.speed) === 4 && r1 > 0.1 && r4 / r1 > 2.5, `vitesse ×4 : la lecture avance ${(r4 / r1).toFixed(1)} fois plus vite qu'à ×1`);
    await page.click('#speed');
    await page.click('#play');
    const f0 = await page.evaluate(() => __kv.etat.frames); await sleep(600);
    check(await page.evaluate(() => __kv.etat.frames) === f0, 'à l\'arrêt, la carte n\'est plus redessinée à chaque image');
    await page.locator('#scrub').fill('300'); await sleep(100);
    check(await page.evaluate(() => Math.abs(__kv.etat.t / __kv.etat.T - .3) < .01 && /jour|·|→|Départ/.test(document.getElementById('when').textContent)), 'défilement à l\'arrêt : la position et le bandeau suivent');
    await page.click('#play'); await sleep(300);
    // onglet caché : la boucle s'arrête, le temps n'avance plus ; retour : elle repart
    const hide = h => page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);
    await hide(true);
    const h0 = await page.evaluate(() => [__kv.etat.frames, __kv.etat.t, __kv.etat.raf]); await sleep(600);
    const h1 = await page.evaluate(() => [__kv.etat.frames, __kv.etat.t, __kv.etat.raf]);
    check(h1[0] === h0[0] && h1[1] === h0[1] && h1[2] === 0, 'onglet caché : plus aucune image dessinée, la lecture attend');
    await hide(false); await sleep(400);
    check(await page.evaluate(() => __kv.etat.frames) > h1[0] && await page.evaluate(() => __kv.etat.t) > h1[1], 'onglet de retour : la lecture reprend là où elle était');
    check(await page.evaluate(() => __kv.etat.t) - h1[1] < 1, 'pas de saut dans le voyage au retour');
    // pendant un séjour la vue est fixe : le fond de carte n'est pas recalculé à chaque image
    await page.evaluate(() => { const e = __kv.etat, o = e.seq.find(q => q.kind === 'stay' && q.s.show.length >= 3); e.speed = 1; e.t = o.t0 + 0.05; });
    const b0 = await page.evaluate(() => [__kv.etat.baseDraws, __kv.etat.frames]); await sleep(700);
    const b1 = await page.evaluate(() => [__kv.etat.baseDraws, __kv.etat.frames]);
    check(b1[1] > b0[1] && b1[0] - b0[0] <= 1, `séjour : ${b1[1] - b0[1]} images dessinées, fond de carte recalculé ${b1[0] - b0[0]} fois`);
    // la touche Espace met en pause
    await page.locator('#map').click(); await page.keyboard.press('Space'); await sleep(100);
    check(!(await page.evaluate(() => __kv.etat.playing)), 'Espace : pause');
    check(errs.length === 0, `lecture sans erreur (${errs.slice(0, 2).join(' | ')})`);
    await ctx.close();
  }

  // ---------- dates EXIF bizarres ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage(); const errs = watch(page);
    await page.goto(URL); await ready(page);
    const files = await makePhotos(page, [...trip3, { date: '0000:00:00 00:00:00', lat: 41.16, lon: -8.62 }, { date: '2026:13:45 99:00:00', lat: 40.42, lon: -3.70 }]);
    await importAndWait(page, files, 5);
    const r = await page.evaluate(() => ({ years: __kv.etat.photos.map(p => new Date(p.t).getFullYear()), noDate: __kv.etat.photos.filter(p => p.noDate).length, warn: document.getElementById('warn').textContent, stats: document.getElementById('stats').textContent }));
    check(r.years.every(y => y >= 2020) && r.noDate === 2, `horloge non réglée : pas de photo en 1899 (années ${[...new Set(r.years)].join(', ')})`);
    check(/2 photos sans date/.test(r.warn), 'les deux photos sans date valide sont signalées');
    check(!/\d{4,}\s*jours/.test(r.stats), `résumé plausible (${r.stats.replace(/\s+/g, ' ').slice(0, 60)})`);
    check(errs.length === 0, `dates bizarres sans erreur (${errs.slice(0, 2).join(' | ')})`);
    await ctx.close();
  }

  // ---------- navigation privée : pas d'IndexedDB ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('refusé', 'SecurityError'); } }));
    const page = await ctx.newPage(); const errs = watch(page);
    await page.goto(URL); await ready(page);
    check(await page.evaluate(() => __kv.etat.isDemo && __kv.etat.stops.length === 8), 'sans IndexedDB : l\'appli démarre sur la démo');
    await importAndWait(page, await makePhotos(page, trip3), 3);
    await page.waitForFunction(() => !document.getElementById('keepwarn').hidden, null, { timeout: 5000 }).catch(() => {});
    check(/privée/.test(await page.locator('#keepwarn').innerText()), 'sans IndexedDB : l\'appli prévient que le voyage ne sera pas gardé');
    check(await page.locator('#exp').isVisible(), 'sans IndexedDB : le carnet reste téléchargeable');
    check(errs.length === 0, `navigation privée sans erreur (${errs.slice(0, 2).join(' | ')})`);
    await ctx.close();
  }

  // ---------- stockage plein ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(() => { IDBObjectStore.prototype.put = function () { throw new DOMException('plein', 'QuotaExceededError'); }; });
    const page = await ctx.newPage(); const errs = watch(page);
    await page.goto(URL); await ready(page);
    await importAndWait(page, await makePhotos(page, trip3), 3);
    check(await page.evaluate(() => __kv.keepStatus()) === 'plein', 'stockage plein : détecté');
    check(/plein/.test(await page.locator('#keepwarn').innerText()), 'stockage plein : message, avec le conseil de télécharger le carnet');
    check(await page.evaluate(() => __kv.etat.stops.length) === 3, 'stockage plein : le voyage reste affiché');
    check(errs.length === 0, `stockage plein sans erreur (${errs.slice(0, 2).join(' | ')})`);
    await ctx.close();
  }

  // ---------- base gardée par la version 1.2 (schéma v1) : montée en v2 dans le vrai navigateur ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage(); const errs = watch(page);
    // page du même site, sans l'appli : on y écrit la base comme la version 1.2
    await page.goto(URL.replace('index.html', 'README.md'));
    const files = await makePhotos(page, trip3);
    const photos = files.map((f, i) => ({ id: i + 1, t: new Date(2026, 5, 1 + 2 * i, 10).getTime(), lat: trip3[i].lat, lon: trip3[i].lon, est: false, cap: '', place: '', src: 'data:image/jpeg;base64,' + f.buffer.toString('base64') }));
    await page.evaluate(photos => new Promise((res, rej) => {
      const r = indexedDB.open('kevoyage', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('voyage');
      r.onsuccess = () => { const tx = r.result.transaction('voyage', 'readwrite'); tx.objectStore('voyage').put({ version: 1, title: 'Gardé par la 1.2', names: { 2: 'Porto, enfin' }, photos }, 'courant'); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
    }), photos);
    await page.goto(URL); await ready(page);
    const r = await page.evaluate(() => ({ demo: __kv.etat.isDemo, n: __kv.etat.photos.length, title: document.getElementById('title').value, names: __kv.etat.stops.map(s => s.name) }));
    check(!r.demo && r.n === 3 && r.title === 'Gardé par la 1.2' && r.names[1] === 'Porto, enfin', `base de la version 1.2 : voyage retrouvé après la montée de schéma (${r.names.join(', ')})`);
    const db = await page.evaluate(() => new Promise(res => { const o = indexedDB.open('kevoyage'); o.onsuccess = () => { const d = o.result, tx = d.transaction(['voyage', 'photos']); const h = tx.objectStore('voyage').get('courant'), k = tx.objectStore('photos').getAllKeys(); tx.oncomplete = () => { d.close(); res({ v: d.version, head: Object.keys(h.result), keys: k.result }); }; }; }));
    check(db.v === 2 && !db.head.includes('photos') && db.keys.length === 1, `schéma ${db.v} : en-tête léger et ${db.keys.length} paquet de photos`);
    check(errs.length === 0, `montée de schéma sans erreur (${errs.slice(0, 2).join(' | ')})`);
    await ctx.close();
  }

  // ---------- 300 photos ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage(); const errs = watch(page);
    await page.goto(URL); await ready(page);
    const cities = [[38.7223, -9.1393], [41.1579, -8.6291], [40.4168, -3.7038], [41.3874, 2.1686], [43.2965, 5.3698], [45.764, 4.8357], [48.8566, 2.3522], [50.8503, 4.3517], [52.3676, 4.9041], [52.52, 13.405]];
    const exifs = Array.from({ length: 300 }, (_, i) => {
      const c = cities[Math.floor(i / 30)], d = new Date(2026, 6, 1 + Math.floor(i / 15), 8 + (i % 15) % 12, (i * 7) % 60);
      const p = n => String(n).padStart(2, '0');
      return { date: `${d.getFullYear()}:${p(d.getMonth() + 1)}:${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:00`, ...(i % 10 === 5 ? {} : { lat: c[0] + (i % 7) * 0.003, lon: c[1] + (i % 5) * 0.003 }) };
    });
    const files = await makePhotos(page, exifs, 1600, 1200);
    const t0 = Date.now();
    await importAndWait(page, files, 300);
    const secs = (Date.now() - t0) / 1000;
    const r = await page.evaluate(async () => {
      const e = __kv.etat, sizes = [];
      for (const p of e.photos.slice(0, 12)) { const im = new Image(); im.src = p.src; await im.decode(); sizes.push(Math.max(im.naturalWidth, im.naturalHeight)); }
      return { stops: e.stops.length, est: e.photos.filter(p => p.est).length, sizes, srcKb: e.photos.reduce((a, p) => a + p.src.length, 0) / 1024 / e.photos.length, thumb: e.photos[0].thumb && e.photos[0].thumb.width };
    });
    check(r.stops === 10 && r.est === 30, `300 photos : ${r.stops} étapes, ${r.est} photos sans lieu rattachées (en ${secs.toFixed(1)} s)`);
    check(secs < 90, `300 photos importées en moins de 90 s (${secs.toFixed(1)} s)`);
    check(r.sizes.every(s => s === 1000), `photos réduites à 1000 px (${[...new Set(r.sizes)].join(', ')})`);
    check(r.thumb === 96, 'miniatures de la carte : 96 px');
    console.log(`      poids moyen d'une photo gardée : ${r.srcKb.toFixed(0)} Ko`);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('HeapProfiler.collectGarbage');
    const { usedSize } = await cdp.send('Runtime.getHeapUsage');
    const mb = usedSize / 1048576;
    console.log(`      mémoire JavaScript après import : ${mb.toFixed(0)} Mo`);
    check(mb < 250, `mémoire JavaScript avec 300 photos sous 250 Mo (${mb.toFixed(0)} Mo)`);
    const before = await page.evaluate(() => __kv.etat.frames); await sleep(2000);
    const fps = (await page.evaluate(() => __kv.etat.frames) - before) / 2;
    check(fps >= 8, `lecture fluide avec 300 photos : ${fps.toFixed(0)} images/s dessinées`);
    check(await page.evaluate(() => __kv.keepStatus()) === 'ok', '300 photos : voyage gardé');
    await page.reload(); await ready(page);
    check(await page.evaluate(() => !__kv.etat.isDemo && __kv.etat.photos.length === 300 && __kv.etat.stops.length === 10), '300 photos : retrouvées après rechargement');
    await page.screenshot({ path: `${OUT}/robustesse-300.png` });
    check(errs.length === 0, `300 photos sans erreur (${errs.slice(0, 2).join(' | ')})`);

    // ---------- carnet exporté ouvert sur téléphone ----------
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exp')]);
    const carnet = `${OUT}/carnet-300.html`; await dl.saveAs(carnet);
    await ctx.close();
    const tctx = await browser.newContext({ ...devices['Pixel 7'] });
    const tel = await tctx.newPage(); const terr = watch(tel);
    // hors ligne : rien ne sort ; les polices (seule ressource externe) répondent vides, le navigateur prend les polices système
    await tel.route('**/*', rt => rt.request().url().startsWith('file:') ? rt.continue() : /fonts\.googleapis/.test(rt.request().url()) ? rt.fulfill({ status: 200, contentType: 'text/css', body: '' }) : rt.abort());
    await tel.goto('file://' + process.cwd() + '/' + carnet); await ready(tel); await sleep(800);
    check(await tel.evaluate(() => __kv.etat.photos.length === 300 && __kv.etat.playing && document.body.classList.contains('viewer')), 'carnet de 300 photos ouvert sur Pixel 7, hors ligne, et rejoué');
    await tel.tap('#play'); await sleep(200);
    check(!(await tel.evaluate(() => __kv.etat.playing)), 'carnet sur téléphone : pause au doigt');
    check(await tel.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'carnet sur téléphone : pas de défilement horizontal');
    await tel.screenshot({ path: `${OUT}/robustesse-carnet-pixel7.png` });
    check(terr.length === 0, `carnet sur téléphone sans erreur (${terr.slice(0, 2).join(' | ')})`);
    await tctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
if (fails.length) { console.error(`\n${fails.length} échec(s)`); process.exit(1); }
console.log('\nRobustesse et performance : tout est bon.');
