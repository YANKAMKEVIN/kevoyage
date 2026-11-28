// Voyage rangé par paquets de photos dans IndexedDB (schéma v2) : montée depuis le schéma v1 sans perte,
// écritures limitées à ce qui change, transaction unique (stockage plein, deux onglets), paquet manquant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { KEY, DB_NAME, STORE, PHOTOS, DB_VERSION, PAGE, idbBackend, split, pageSig, pageOf } from '../../src/idb.js';
import { SAVE_VERSION, MAX_PHOTOS, loadTrip, saveTripStatus, saveMessage, serialize, clearTrip, migrate } from '../../src/store.js';

const IMG = n => 'data:image/jpeg;base64,' + String(n).padStart(6, '0') + 'B'.repeat(200);
const mk = (n, from = 1, extra = {}) => Array.from({ length: n }, (_, i) => ({ id: from + i, t: 1.78e12 + (from + i) * 6e5, lat: 35 + i / 1e4, lon: 135, est: false, src: IMG(from + i), ...extra }));
const trip = (photos, title = 'Voyage', names = {}) => serialize(title, names, photos);

/** Lit la base sans passer par l'appli. */
const raw = (f, store, key) => new Promise((res, rej) => {
  const r = f.open(DB_NAME);
  r.onsuccess = () => { const db = r.result; const tx = db.transaction(store); const q = key === undefined ? tx.objectStore(store).getAllKeys() : tx.objectStore(store).get(key); tx.oncomplete = () => { db.close(); res(q.result); }; };
  r.onerror = () => rej(r.error);
});
/** Base au schéma v1, écrite comme la version 1.2 de l'appli. */
const v1Put = (f, value) => new Promise((res, rej) => {
  const r = f.open(DB_NAME, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => { const tx = r.result.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, KEY); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
  r.onerror = () => rej(r.error);
});
/** Compte les écritures par magasin pendant fn. */
async function countPuts(fn) {
  const real = IDBObjectStore.prototype.put, n = { [STORE]: 0, [PHOTOS]: 0 };
  IDBObjectStore.prototype.put = function (...a) { n[this.name]++; return real.apply(this, a); };
  try { await fn(); } finally { IDBObjectStore.prototype.put = real; }
  return n;
}

test('paquets : numéro de paquet, empreinte qui change dès qu\'un champ ou l\'image change', () => {
  assert.equal(pageOf(1), 0); assert.equal(pageOf(PAGE), 0); assert.equal(pageOf(PAGE + 1), 1);
  const ps = mk(3), s0 = pageSig(ps);
  assert.equal(pageSig(mk(3)), s0, 'stable');
  for (const change of [{ t: 1 }, { lat: 1 }, { lon: 1 }, { est: true }, { noDate: true }, { tz: 540 }, { cap: 'x' }, { place: 'y' }, { src: IMG(9) }, { src: IMG(1) + 'B' }]) {
    const q = mk(3); Object.assign(q[1], change);
    assert.notEqual(pageSig(q), s0, JSON.stringify(change));
  }
  assert.equal(split({ photos: [{ id: 1.5, src: '' }] }), null);
  assert.equal(split({ photos: [{ id: 0, src: '' }] }), null);
  assert.equal(split('x'), null);
  const s = split(trip(mk(250)));
  assert.deepEqual([...s.pages.keys()], [0, 1, 2]);
  assert.equal(s.head.n, 250); assert.ok(!('photos' in s.head));
});

test('schéma v1 -> v2 : le voyage gardé par la version 1.2 est rangé en paquets, sans perte', async () => {
  const f = new IDBFactory();
  const photos = mk(250, 1, { cap: '', place: '' }); photos[7].noDate = true; photos[8].est = true; photos[8].cap = 'Légende';
  const old = { version: 1, title: 'Ancien voyage', names: { 1: 'Lisbonne', 120: 'Porto' }, photos };
  await v1Put(f, old);
  const db = idbBackend(f);
  const d = await loadTrip(db);
  assert.equal(d.version, SAVE_VERSION);
  assert.deepEqual(d, migrate(old), 'chaque photo, chaque nom, le titre : tout est là');
  // dans la base : un en-tête léger et trois paquets
  const head = await raw(f, STORE, KEY);
  assert.ok(!('photos' in head)); assert.equal(head.n, 250); assert.deepEqual(Object.keys(head.pages), ['0', '1', '2']);
  assert.deepEqual(await raw(f, PHOTOS), [0, 1, 2]);
  assert.equal((await raw(f, PHOTOS, 2)).photos.length, 50);
  // relu par un nouvel onglet, puis modifié et relu
  assert.deepEqual(await loadTrip(idbBackend(f)), d);
  assert.equal(await saveTripStatus(db, trip(d.photos, 'Renommé', d.names)), 'ok');
  assert.equal((await loadTrip(idbBackend(f))).title, 'Renommé');
});

test('schéma v1 -> v2 : carnet sans numéro de version, voyage abîmé, base vide', async () => {
  const f1 = new IDBFactory();
  await v1Put(f1, { title: 'Vieux', names: {}, photos: mk(3).map(({ cap, place, ...p }) => p) });
  const d1 = await loadTrip(idbBackend(f1));
  assert.equal(d1.title, 'Vieux'); assert.equal(d1.photos.length, 3);
  // abîmé : laissé tel quel par la montée, puis mis de côté par l'appli, intact
  const f2 = new IDBFactory(), bad = { version: 1, title: 'x', names: {}, photos: [{ id: 'a' }] };
  await v1Put(f2, bad);
  const db2 = idbBackend(f2);
  assert.equal(await loadTrip(db2), null);
  assert.deepEqual(await db2.get(KEY + '.abimee'), bad);
  // rien de gardé : la montée crée seulement le magasin des photos
  const f3 = new IDBFactory();
  await new Promise(res => { const r = f3.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => { r.result.close(); res(); }; });
  assert.equal(await loadTrip(idbBackend(f3)), null);
  assert.deepEqual(await raw(f3, PHOTOS), []);
});

test('écritures : renommer n\'écrit que l\'en-tête, importer n\'écrit que les nouveaux paquets', async () => {
  const f = new IDBFactory(), db = idbBackend(f);
  const photos = mk(1000);
  let n = await countPuts(() => saveTripStatus(db, trip(photos)));
  assert.deepEqual(n, { [STORE]: 1, [PHOTOS]: 10 }, 'premier enregistrement : 10 paquets');
  n = await countPuts(() => saveTripStatus(db, trip(photos, 'Nouveau titre', { 5: 'Kyoto' })));
  assert.deepEqual(n, { [STORE]: 1, [PHOTOS]: 0 }, 'nom d\'étape ou titre : aucun paquet réécrit');
  const more = [...photos, ...mk(30, 1001)];
  n = await countPuts(() => saveTripStatus(db, trip(more)));
  assert.deepEqual(n, { [STORE]: 1, [PHOTOS]: 1 }, '30 photos ajoutées : un seul paquet écrit');
  more[350] = { ...more[350], lat: 34.1 }; // une photo sans lieu ré-estimée
  n = await countPuts(() => saveTripStatus(db, trip(more)));
  assert.equal(n[PHOTOS], 1);
  const d = await loadTrip(idbBackend(f));
  assert.equal(d.photos.length, 1030); assert.equal(d.photos[350].lat, 34.1);
  assert.deepEqual(d.photos, trip(more).photos);
});

test('voyage remplacé par un plus petit : les anciens paquets sont effacés ; effacer le voyage vide les paquets', async () => {
  const f = new IDBFactory(), db = idbBackend(f);
  assert.equal(await saveTripStatus(db, trip(mk(450))), 'ok');
  assert.equal(await saveTripStatus(db, trip(mk(120))), 'ok');
  assert.deepEqual(await raw(f, PHOTOS), [0, 1]);
  assert.equal((await loadTrip(db)).photos.length, 120);
  await clearTrip(db);
  assert.deepEqual(await raw(f, PHOTOS), []);
  assert.equal(await loadTrip(db), null);
});

test('stockage plein au milieu d\'une sauvegarde : rien n\'est écrit à moitié, le voyage précédent reste entier', async () => {
  const f = new IDBFactory(), db = idbBackend(f), first = trip(mk(300), 'Avant');
  assert.equal(await saveTripStatus(db, first), 'ok');
  const real = IDBObjectStore.prototype.put;
  let puts = 0;
  // le deuxième paquet ne passe plus, à chaque essai (l'appli réessaie une fois après avoir libéré de la place)
  IDBObjectStore.prototype.put = function (...a) { if (this.name === PHOTOS && ++puts % 2 === 0) throw new DOMException('plein', 'QuotaExceededError'); return real.apply(this, a); };
  try { assert.equal(await saveTripStatus(db, trip(mk(500), 'Après')), 'plein'); } finally { IDBObjectStore.prototype.put = real; }
  assert.deepEqual(await loadTrip(idbBackend(f)), first, 'ni en-tête neuf, ni paquet orphelin');
  assert.deepEqual(await raw(f, PHOTOS), [0, 1, 2]);
});

test('deux onglets : l\'empreinte est relue dans la base, pas gardée en mémoire', async () => {
  const f = new IDBFactory(), a = idbBackend(f), b = idbBackend(f);
  const x = trip(mk(150), 'X'), y = trip(mk(150, 1, { lat: 10 }), 'Y');
  assert.equal(await saveTripStatus(a, x), 'ok');
  assert.equal(await saveTripStatus(b, y), 'ok');
  assert.equal(await saveTripStatus(a, { ...x, title: 'X renommé' }), 'ok');
  const d = await loadTrip(idbBackend(f));
  assert.equal(d.title, 'X renommé'); assert.deepEqual(d.photos, x.photos, 'les paquets de l\'autre onglet sont bien remplacés');
});

test('paquet manquant : voyage mis de côté en entier, jamais relu à moitié', async () => {
  const f = new IDBFactory(), db = idbBackend(f);
  assert.equal(await saveTripStatus(db, trip(mk(250), 'Troué')), 'ok');
  await new Promise(res => { const r = f.open(DB_NAME, DB_VERSION); r.onsuccess = () => { const tx = r.result.transaction(PHOTOS, 'readwrite'); tx.objectStore(PHOTOS).delete(1); tx.oncomplete = () => { r.result.close(); res(); }; }; });
  assert.equal(await loadTrip(db), null);
  const aside = await db.get(KEY + '.abimee');
  assert.equal(aside.title, 'Troué'); assert.equal(aside.photos.length, 150); assert.equal(aside.incomplet, true);
  assert.equal(await saveTripStatus(db, trip(mk(5))), 'ok', 'l\'appli peut repartir');
});

test('3000 photos : enregistrées en 30 paquets, renommer reste instantané', async () => {
  const f = new IDBFactory(), db = idbBackend(f), photos = mk(3000);
  assert.equal(await saveTripStatus(db, trip(photos)), 'ok');
  const t0 = performance.now();
  const n = await countPuts(() => saveTripStatus(db, trip(photos, 'Tour du monde', { 1: 'Départ' })));
  const ms = performance.now() - t0;
  assert.equal(n[PHOTOS], 0);
  assert.ok(ms < 2000, `renommer avec 3000 photos : ${ms.toFixed(0)} ms`);
  assert.equal((await loadTrip(idbBackend(f))).photos.length, 3000);
});

test('au-delà de la limite de photos : refus clair, avec un message', async () => {
  const db = idbBackend(new IDBFactory());
  assert.equal(await saveTripStatus(db, trip(mk(MAX_PHOTOS + 1))), 'trop');
  assert.match(saveMessage('trop'), /carnet/);
  assert.match(saveMessage('trop'), new RegExp(String(MAX_PHOTOS)));
});

test('fuseau de la prise de vue : gardé, relu, et refusé s\'il est impossible', async () => {
  const db = idbBackend(new IDBFactory());
  const ps = mk(3); ps[0].tz = 540; ps[1].tz = -210;
  assert.equal(await saveTripStatus(db, trip(ps)), 'ok');
  const d = await loadTrip(db);
  assert.deepEqual(d.photos.map(p => p.tz), [540, -210, undefined]);
  assert.equal(await saveTripStatus(db, { ...trip(ps), photos: [{ ...trip(ps).photos[0], tz: 2000 }] }), 'invalide');
  assert.equal(trip([{ ...ps[2], tz: 'x' }]).photos[0].tz, undefined, 'fuseau impossible non sérialisé');
});
