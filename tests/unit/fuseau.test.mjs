// Jours du voyage dans un fuseau à heure d'été : un jour de changement d'heure dure 23 ou 25 heures.
process.env.TZ = 'Europe/Paris';
const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { trip, load, photo } = await import('./helpers.mjs');

const at = (y, m, d, h) => new Date(y, m - 1, d, h).getTime();
const ph = (t, lat, lon) => ({ ...photo(0, 0, lat, lon), t });

test('le fuseau de test est bien actif (heure d\'été à Paris)', () => {
  assert.equal(new Date(2026, 6, 1).getTimezoneOffset(), -120);
  assert.equal(new Date(2026, 0, 1).getTimezoneOffset(), -60);
});

test('passage à l\'heure d\'été (29 mars 2026) : 3 jours, pas 2', () => {
  load([ph(at(2026, 3, 28, 10), 38.72, -9.14), ph(at(2026, 3, 30, 10), 41.15, -8.63)]);
  assert.equal(trip.summary().days, 3);
  assert.equal(trip.dayNo(at(2026, 3, 30, 10)), 3);
  assert.equal(trip.dayNo(at(2026, 3, 29, 23)), 2);
});

test('retour à l\'heure d\'hiver (25 octobre 2026) : 2 jours, pas 3', () => {
  load([ph(at(2026, 10, 25, 1), 38.72, -9.14), ph(at(2026, 10, 26, 23), 41.15, -8.63)]);
  assert.equal(trip.summary().days, 2);
  assert.equal(trip.dayNo(at(2026, 10, 26, 23)), 2);
});

test('long voyage qui traverse les deux changements d\'heure', () => {
  load([ph(at(2026, 3, 1, 9), 38.72, -9.14), ph(at(2026, 11, 30, 21), 41.15, -8.63)]);
  assert.equal(trip.summary().days, 275);
});
