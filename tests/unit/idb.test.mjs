// Stockage IndexedDB réel (fake-indexeddb, même API que le navigateur) : schéma versionné, migration,
// données abîmées, quota plein, navigation privée, ouverture qui ne répond jamais.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { KEY, DB_NAME, STORE, DB_VERSION, SAVE_VERSION, idbBackend, defaultFactory, loadTrip, saveTrip, saveTripStatus, saveMessage, isQuotaError, serialize, clearTrip } from '../../src/store.js';
import { japan, memDb } from './helpers.mjs';

const sample = (title = 'Japon') => serialize(title, {}, japan());
/** Écrit directement dans la base, comme une ancienne version de l'appli. */
const rawPut = (factory, key, value, version = DB_VERSION) => new Promise((res, rej) => {
  const r = factory.open(DB_NAME, version);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => { const tx = r.result.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, key); tx.oncomplete = () => { r.result.close(); res(); }; tx.onerror = () => rej(tx.error); };
  r.onerror = () => rej(r.error);
});

test('aller-retour dans une vraie base IndexedDB, base créée au premier accès', async () => {
  const f = new IDBFactory(), db = idbBackend(f), d = sample();
  assert.equal(await loadTrip(db), null);
  assert.equal(await saveTripStatus(db, d), 'ok');
  assert.deepEqual(await loadTrip(db), d);
  // une seconde instance (nouvel onglet) relit la même chose
  assert.deepEqual(await loadTrip(idbBackend(f)), d);
  await clearTrip(db);
  assert.equal(await loadTrip(db), null);
});

test('base déjà créée par la version précédente : relue telle quelle', async () => {
  const f = new IDBFactory();
  await rawPut(f, KEY, sample('Ancien'));
  assert.equal((await loadTrip(idbBackend(f))).title, 'Ancien');
});

test('voyage sans numéro de version (carnet d\'avant 1.1.0) dans la base : migré', async () => {
  const f = new IDBFactory();
  const { version, ...old } = sample('Vieux');
  old.photos = old.photos.map(({ cap, place, ...p }) => p);
  await rawPut(f, KEY, old);
  const d = await loadTrip(idbBackend(f));
  assert.equal(d.version, SAVE_VERSION); assert.equal(d.title, 'Vieux'); assert.ok(d.photos.every(p => p.cap === '' && p.place === ''));
});

test('voyage abîmé dans la base : mis de côté sous courant.abimee, puis l\'appli peut sauvegarder à nouveau', async () => {
  const f = new IDBFactory(), db = idbBackend(f);
  await rawPut(f, KEY, { version: 1, title: 'x', names: {}, photos: [{ id: 1 }] });
  assert.equal(await loadTrip(db), null);
  assert.equal((await db.get(KEY + '.abimee')).title, 'x');
  assert.equal(await db.get(KEY), undefined);
  assert.equal(await saveTripStatus(db, sample()), 'ok');
});

test('voyage d\'une version future de l\'appli : jamais écrasé en silence', async () => {
  const f = new IDBFactory(), db = idbBackend(f);
  await rawPut(f, KEY, { ...sample(), version: SAVE_VERSION + 1 });
  assert.equal(await loadTrip(db), null);
  assert.equal((await db.get(KEY + '.abimee')).version, SAVE_VERSION + 1);
});

test('base d\'un schéma plus récent (autre onglet à jour) : erreur propre, pas de plantage', async () => {
  const f = new IDBFactory();
  await rawPut(f, KEY, sample(), DB_VERSION + 1);
  const db = idbBackend(f);
  assert.equal(await loadTrip(db), null);
  assert.equal(await saveTripStatus(db, sample()), 'erreur');
});

test('un autre onglet passe à un schéma plus récent : la connexion se retire au lieu de le bloquer', async () => {
  const f = new IDBFactory(), db = idbBackend(f);
  assert.equal(await saveTripStatus(db, sample()), 'ok');
  await new Promise((res, rej) => { const r = f.open(DB_NAME, DB_VERSION + 1); r.onupgradeneeded = () => {}; r.onsuccess = () => { r.result.close(); res(); }; r.onblocked = () => rej(new Error('bloqué par notre connexion')); r.onerror = () => rej(r.error); });
});

test('navigation privée : pas d\'IndexedDB, ou accès qui lève une erreur', async () => {
  assert.equal(idbBackend(null), null);
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  try {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw new DOMException('refusé', 'SecurityError'); } });
    assert.equal(defaultFactory(), null);
    assert.equal(idbBackend(), null);
  } finally { if (saved) Object.defineProperty(globalThis, 'indexedDB', saved); else delete globalThis.indexedDB; }
  assert.equal(await saveTripStatus(null, sample()), 'indisponible');
  assert.equal(await loadTrip(null), null);
});

test('open() qui lève (Firefox privé ancien) : erreur, et l\'essai suivant repart de zéro', async () => {
  let calls = 0; const real = new IDBFactory();
  const flaky = { open: (...a) => { if (++calls === 1) throw new DOMException('privé', 'InvalidStateError'); return real.open(...a); } };
  const db = idbBackend(/** @type {any} */ (flaky));
  assert.equal(await saveTripStatus(db, sample()), 'erreur');
  assert.equal(await saveTripStatus(db, sample()), 'ok', 'pas d\'échec gardé en mémoire');
  assert.equal(calls, 2);
});

test('open() sans réponse (bug Safari) : abandon après le délai, l\'appli démarre quand même', async () => {
  const hang = { open: () => ({}) };
  const db = idbBackend(/** @type {any} */ (hang), 30);
  const t0 = Date.now();
  assert.equal(await loadTrip(db), null);
  assert.ok(Date.now() - t0 < 1000);
});

test('ouverture bloquée par un autre onglet : erreur propre', async () => {
  const blocked = { open: () => { const r = {}; setTimeout(() => r.onblocked && r.onblocked(), 0); return r; } };
  assert.equal(await saveTripStatus(idbBackend(/** @type {any} */ (blocked), 500), sample()), 'erreur');
});

test('quota plein : on libère le voyage abîmé mis de côté et on réessaie', async () => {
  const quota = () => new DOMException('plein', 'QuotaExceededError');
  const db = memDb({ [KEY + '.abimee']: { gros: 'x'.repeat(10) } });
  let full = true; const set = db.set;
  db.set = async (k, v) => { if (full && db.m.has(KEY + '.abimee')) throw quota(); return set(k, v); };
  assert.equal(await saveTripStatus(db, sample()), 'ok');
  assert.equal(db.m.has(KEY + '.abimee'), false);
  const always = { ...memDb(), set: async () => { throw quota(); } };
  assert.equal(await saveTripStatus(always, sample()), 'plein');
  assert.equal(await saveTrip(always, sample()), false);
});

test('erreurs de quota reconnues sur tous les navigateurs ; autres erreurs distinguées', async () => {
  assert.ok(isQuotaError(new DOMException('', 'QuotaExceededError')));
  assert.ok(isQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }));
  assert.ok(isQuotaError({ code: 22 }));
  assert.ok(isQuotaError({ inner: { name: 'QuotaExceededError' } }));
  assert.ok(!isQuotaError(new Error('autre')) && !isQuotaError(null));
  const broken = { ...memDb(), set: async () => { throw new Error('disque'); } };
  assert.equal(await saveTripStatus(broken, sample()), 'erreur');
  assert.equal(await saveTripStatus(memDb(), { ...sample(), photos: [] }), 'invalide');
});

test('messages : rien quand tout va bien, conseil de télécharger le carnet sinon', () => {
  assert.equal(saveMessage('ok'), ''); assert.equal(saveMessage('invalide'), '');
  for (const s of ['plein', 'indisponible', 'erreur']) assert.match(saveMessage(s), /carnet/);
  assert.match(saveMessage('plein'), /plein/); assert.match(saveMessage('indisponible'), /privée/);
});

test('300 photos : sauvegarde et relecture dans la base', async () => {
  const IMG = 'data:image/jpeg;base64,' + 'A'.repeat(4000);
  const photos = Array.from({ length: 300 }, (_, i) => ({ id: i + 1, t: 1.7e12 + i * 6e5, lat: 35 + i / 1000, lon: 135, est: false, src: IMG }));
  const db = idbBackend(new IDBFactory()), d = serialize('Gros voyage', {}, photos);
  assert.equal(await saveTripStatus(db, d), 'ok');
  assert.equal((await loadTrip(db)).photos.length, 300);
});
