import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY } from '../../src/idb.js';
import { SAVE_VERSION, MAX_PHOTOS, isValidTrip, migrate, parse, serialize, loadTrip, saveTrip, clearTrip } from '../../src/store.js';
import { japan, memDb, IMG } from './helpers.mjs';

const sample = () => (() => { const ph = japan(); return serialize('Japon, mai 2026', { [ph[1].id]: 'Shibuya', 999: 'orphelin', [ph[2].id]: '' }, ph); })();

test('format sauvegardé : valide, noms orphelins ou vides retirés', () => {
  const d = sample();
  assert.ok(isValidTrip(d));
  assert.equal(d.version, SAVE_VERSION);
  assert.ok(!('999' in d.names), 'nom d\'une photo absente retiré');
  assert.equal(Object.values(d.names).join(), 'Shibuya', 'nom vide retiré, nom choisi gardé');
  assert.ok(d.photos.every(p => !('thumb' in p)));
});

test('aller-retour : ce qui est sauvé est relu à l\'identique', async () => {
  const db = memDb(), d = sample();
  assert.ok(await saveTrip(db, d));
  assert.deepEqual(await loadTrip(db), d);
});

test('rien de sauvegardé, ou stockage indisponible : null', async () => {
  assert.equal(await loadTrip(memDb()), null);
  assert.equal(await loadTrip(null), null);
  const blocked = { get: async () => { throw new Error('bloqué'); }, set: async () => { throw new Error('bloqué'); }, del: async () => {} };
  assert.equal(await loadTrip(blocked), null);
  assert.equal(await saveTrip(blocked, sample()), false);
  await clearTrip(blocked);
});

test('voyage abîmé : mis de côté, jamais écrasé en silence', async () => {
  const good = sample();
  const bad = ['texte', [], { ...good, photos: [] }, { ...good, title: 3 }, { ...good, photos: [{ ...good.photos[0], src: 'javascript:alert(1)' }] },
    { ...good, photos: [{ ...good.photos[0], lat: 120 }] }, { ...good, photos: [good.photos[0], good.photos[0]] }, { ...good, names: { abc: 'x' } }];
  for (const b of bad) {
    const db = memDb({ [KEY]: b });
    assert.equal(await loadTrip(db), null, JSON.stringify(b).slice(0, 80));
    assert.deepEqual(db.m.get(KEY + '.abimee'), b);
    assert.equal(db.m.has(KEY), false);
  }
});

test('voyage d\'une version plus récente : refusé', () => {
  assert.equal(migrate({ ...sample(), version: SAVE_VERSION + 1 }), null);
  assert.equal(parse({ ...sample(), version: SAVE_VERSION + 1 }), null);
});

test('carnet exporté avant 1.1.0 (sans version) : repris', () => {
  const old = { title: 'Lisbonne', names: {}, photos: [{ id: 1, t: 1.7e12, lat: 38.7, lon: -9.1, est: false, src: IMG }] };
  const d = parse(old);
  assert.ok(d); assert.equal(d.version, SAVE_VERSION); assert.equal(d.photos[0].cap, ''); assert.equal(d.title, 'Lisbonne');
});

test('on n\'écrit jamais un voyage invalide ; taille bornée', async () => {
  const db = memDb();
  assert.equal(await saveTrip(db, { ...sample(), photos: [] }), false);
  assert.equal(db.m.size, 0);
  const many = serialize('x', {}, Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => ({ id: i + 1, t: i, lat: 0, lon: 0, est: false, src: IMG })));
  assert.equal(isValidTrip(many), false);
});
