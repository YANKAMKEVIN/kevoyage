// Parcours complet dans un vrai navigateur (Chromium) :
// démo -> lecture, pause, vitesse, défilement, clic sur une étape -> import de vraies photos (date et GPS dans l'EXIF,
// une sans lieu, une sans rien) -> étapes et titre automatiques -> renommer une étape -> rechargement : voyage retrouvé
// -> carnet téléchargé, ouvert hors ligne et rejoué -> ancien carnet (sans version) -> voyage abîmé mis de côté
// -> photos sans aucun lieu : explication. Puis la démo au doigt sur iPhone SE.
// Lancer : npm run partie
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer, connect } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { withExif } from './exif.mjs';

const PORT = await new Promise(res => { const s = createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
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
const ready = page => page.waitForFunction(() => window.__kv && __kv.etat.ready, null, { timeout: 20000 });
const st = page => page.evaluate(() => ({ stops: __kv.etat.stops.map(s => s.name), photos: __kv.etat.photos.length, demo: __kv.etat.isDemo, t: __kv.etat.t, T: __kv.etat.T, playing: __kv.etat.playing }));

/** Photo JPEG peinte dans le navigateur, avec EXIF. */
async function makePhoto(page, name, color, exif) {
  const b64 = await page.evaluate(c => { const cv = document.createElement('canvas'); cv.width = 320; cv.height = 240; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.fillRect(40, 40, 80, 60); return cv.toDataURL('image/jpeg', .9).split(',')[1]; }, color);
  const jpeg = Buffer.from(b64, 'base64');
  return { name, mimeType: 'image/jpeg', buffer: exif ? withExif(jpeg, exif) : jpeg };
}

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL); await ready(page);
  check(/^v\d+\.\d+\.\d+$/.test(await page.locator('#ver').innerText()), 'numéro de version dans le panneau');
  let s = await st(page);
  check(s.demo && s.photos === 19 && s.stops.length === 8, `démo du Japon (${s.stops.length} étapes, ${s.photos} photos)`);
  check(await page.locator('#stats').innerText().then(t => /11\s*jours/.test(t)), 'résumé : 11 jours');
  check(await page.evaluate(() => __kv.demoArt) === 19, 'les 19 photos peintes de la démo sont chargées');

  // lecture, pause, vitesse, défilement
  await sleep(800);
  check((await st(page)).playing && (await st(page)).t > 0, 'la carte s\'anime toute seule');
  await page.click('#play'); const t1 = (await st(page)).t; await sleep(500);
  check(!(await st(page)).playing && (await st(page)).t === t1, 'pause');
  await page.click('#speed'); await page.click('#speed');
  check(await page.locator('#speed').innerText() === '×4', 'vitesse ×4');
  await page.click('#speed');
  await page.locator('#scrub').fill('500'); await sleep(200);
  s = await st(page);
  check(Math.abs(s.t / s.T - .5) < .01, 'la barre de défilement va au milieu du voyage');
  await page.locator('.stop .n').nth(4).click(); await sleep(400);
  const cap = await page.locator('#cmeta').innerText();
  check(!(await page.locator('#card').getAttribute('class')).includes('hide') && cap.includes(s.stops[4]), `clic sur l'étape 5 : polaroïd de ${s.stops[4]}`);
  await page.screenshot({ path: `${OUT}/partie-demo.png` });

  // import de vraies photos
  const files = [
    await makePhoto(page, 'lisbonne.jpg', '#c33', { date: '2026:06:01 10:30:00', lat: 38.7223, lon: -9.1393 }),
    await makePhoto(page, 'lisbonne2.jpg', '#c63', { date: '2026:06:01 18:00:00', lat: 38.7139, lon: -9.1334 }),
    await makePhoto(page, 'sans-lieu.jpg', '#36c', { date: '2026:06:03 12:00:00' }),
    await makePhoto(page, 'porto.jpg', '#3a6', { date: '2026:06:03 17:00:00', lat: 41.1579, lon: -8.6291 }),
    await makePhoto(page, 'madrid.jpg', '#a3c', { date: '2026:06:05 20:00:00', lat: 40.4168, lon: -3.7038 }),
  ];
  await page.setInputFiles('#files', files);
  await page.waitForFunction(() => !__kv.etat.isDemo && __kv.etat.photos.length === 5, null, { timeout: 15000 });
  await sleep(300);
  s = await st(page);
  check(s.stops.length === 3 && s.stops[0] === 'Lisbonne' && s.stops[1] === 'Porto' && s.stops[2] === 'Madrid', `étapes lues dans l'EXIF : ${s.stops.join(', ')}`);
  check(/1 photo sans lieu/.test(await page.locator('#warn').innerText()), 'la photo sans lieu est signalée et placée d\'après l\'heure');
  const title = await page.inputValue('#title');
  check(/Portugal/.test(title) && /Espagne/.test(title) && /juin 2026/.test(title), `titre automatique : « ${title} »`);
  check(await page.locator('#sample').isHidden(), 'la mention « démonstration » disparaît');
  await page.screenshot({ path: `${OUT}/partie-import.png` });

  // renommer une étape et le voyage, puis recharger
  await page.fill('#stop-1', 'Porto, les quais'); await page.fill('#title', 'Ibérie 2026');
  await sleep(600); await page.evaluate(() => __kv.keep());
  await page.reload(); await ready(page);
  s = await st(page);
  check(!s.demo && s.photos === 5 && s.stops[1] === 'Porto, les quais' && await page.inputValue('#title') === 'Ibérie 2026', 'après rechargement : voyage, noms et titre retrouvés');
  check(/retrouvé/.test(await page.locator('#warn').innerText()), 'message « voyage retrouvé »');

  // carnet téléchargé
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#exp')]);
  const carnet = `${OUT}/carnet.html`; await dl.saveAs(carnet);
  check(/^kevoyage-iberie-2026\.html$/.test(dl.suggestedFilename()), `nom du fichier : ${dl.suggestedFilename()}`);
  const html = await page.evaluate(() => __kv.etat.lastExport);
  const viewer = await ctx.newPage(); const verr = [];
  viewer.on('pageerror', e => verr.push(String(e)));
  // le carnet doit marcher hors ligne : on coupe tout sauf les polices
  await viewer.route('**/*', r => r.request().url().startsWith('file:') || /fonts\.(googleapis|gstatic)/.test(r.request().url()) ? r.continue() : r.abort());
  await viewer.goto('file://' + process.cwd() + '/' + carnet); await ready(viewer); await sleep(1500);
  const vs = await st(viewer);
  check(vs.stops.length === 3 && vs.stops[1] === 'Porto, les quais' && vs.playing, 'le carnet s\'ouvre seul, hors ligne, et rejoue le voyage');
  check(await viewer.evaluate(() => document.body.classList.contains('viewer') && document.getElementById('title').readOnly && !document.getElementById('demo').checkVisibility() && !document.getElementById('files').labels[0].checkVisibility()), 'carnet en lecture seule, sans boutons d\'édition');
  await viewer.screenshot({ path: `${OUT}/partie-carnet.png` });
  check(verr.length === 0, `carnet sans erreur (${verr.slice(0, 2).join(' | ')})`);
  await viewer.close();

  // ancien carnet (exporté avant 1.1.0, sans numéro de version)
  const old = html.replace('"trip":{"version":1,', '"trip":{');
  check(old !== html, 'carnet ancien format fabriqué');
  writeFileSync(`${OUT}/carnet-ancien.html`, old);
  const v2 = await ctx.newPage(); await v2.goto('file://' + process.cwd() + `/${OUT}/carnet-ancien.html`); await ready(v2);
  check((await st(v2)).stops.length === 3, 'un carnet de l\'ancien format s\'ouvre');
  await v2.close();
  const broken = html.replace('"trip":{"version":1,', '"trip":{"version":99,');
  writeFileSync(`${OUT}/carnet-futur.html`, broken);
  const v3 = await ctx.newPage(); await v3.goto('file://' + process.cwd() + `/${OUT}/carnet-futur.html`); await ready(v3);
  check(/impossible de l'ouvrir/.test(await v3.locator('#warn').innerText()), 'carnet d\'une version future : message clair, pas de plantage');
  await v3.close();

  // voyage sauvegardé abîmé
  await page.evaluate(() => new Promise((res, rej) => { const r = indexedDB.open('kevoyage', 1); r.onsuccess = () => { const tx = r.result.transaction('voyage', 'readwrite'); tx.objectStore('voyage').put({ version: 1, title: 'x', names: {}, photos: [{ id: 1 }] }, 'courant'); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = rej; }; }));
  await page.reload(); await ready(page);
  s = await st(page);
  const aside = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('kevoyage', 1); r.onsuccess = () => { const q = r.result.transaction('voyage').objectStore('voyage').get('courant.abimee'); q.onsuccess = () => { r.result.close(); res(q.result); }; }; }));
  check(s.demo && aside && aside.title === 'x', 'voyage abîmé mis de côté, retour à la démo');

  // photos sans aucun lieu
  await page.setInputFiles('#files', [await makePhoto(page, 'whatsapp.jpg', '#888', { date: '2026:06:01 10:00:00' }), await makePhoto(page, 'capture.jpg', '#999', null)]);
  await page.waitForFunction(() => !document.getElementById('warn').hidden && /Aucune/.test(document.getElementById('warn').textContent), null, { timeout: 10000 });
  check((await st(page)).demo, 'photos sans lieu : explication (WhatsApp, captures), la démo reste');
  check(errors.length === 0, `aucune erreur (${errors.slice(0, 3).join(' | ')})`);
  await ctx.close();

  // iPhone SE au doigt
  const tctx = await browser.newContext({ ...devices['iPhone SE'] });
  const tel = await tctx.newPage(); const terr = [];
  tel.on('pageerror', e => terr.push(String(e)));
  await tel.goto(URL); await ready(tel);
  await tel.tap('#play'); const tt = (await st(tel)).t; await sleep(400);
  check((await st(tel)).t === tt, 'iPhone SE : pause au doigt');
  await tel.locator('.stop .n').nth(2).scrollIntoViewIfNeeded(); await tel.locator('.stop .n').nth(2).tap(); await sleep(300);
  check(await tel.evaluate(() => { const o = __kv.etat.seq.find(q => q.kind === 'stay' && q.s.i === 2); return __kv.etat.t >= o.t0 && __kv.etat.t < o.t0 + o.dur; }), 'iPhone SE : toucher une étape y emmène');
  check(await tel.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'iPhone SE : pas de défilement horizontal');
  await tel.screenshot({ path: `${OUT}/partie-iphone.png` });
  check(terr.length === 0, `iPhone SE : aucune erreur (${terr.slice(0, 3).join(' | ')})`);
  await tctx.close();
} finally {
  await browser.close();
  server.kill();
}
if (fails.length) { console.error(`\n${fails.length} échec(s)`); process.exit(1); }
console.log('\nParcours complet : tout est bon.');
