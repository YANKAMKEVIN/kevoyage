// Regroupement en étapes, photos sans lieu, trajets, résumé et titre : cas limites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etat, trip, geo, load, photo } from './helpers.mjs';

// à ~0,009° de latitude par km : décale un point vers le nord de d km
const north = (lat, d) => lat + d / 111.2;

test('même endroit sous 15 km : une étape ; au-delà : deux', () => {
  assert.equal(load([photo(0, 9, 48.857, 2.352), photo(0, 12, north(48.857, 14), 2.352)]).stops.length, 1);
  assert.equal(load([photo(0, 9, 48.857, 2.352), photo(0, 12, north(48.857, 16), 2.352)]).stops.length, 2);
});

test('le centre d\'une étape est la moyenne de ses photos', () => {
  const e = load([photo(0, 9, 35.00, 135.70), photo(0, 10, 35.02, 135.72), photo(0, 11, 35.04, 135.74)]);
  assert.ok(Math.abs(e.stops[0].lat - 35.02) < 1e-9 && Math.abs(e.stops[0].lon - 135.72) < 1e-9);
  assert.equal(e.stops[0].n, 3);
});

test('aller-retour : revenir dans une ville crée une nouvelle étape, dans l\'ordre du temps', () => {
  const e = load([photo(0, 9, 38.72, -9.14), photo(2, 9, 41.15, -8.63), photo(4, 9, 38.72, -9.14)]);
  assert.deepEqual(e.stops.map(s => s.name), ['Lisbonne', 'Porto', 'Lisbonne']);
  assert.equal(e.legs.length, 2);
});

test('photos importées dans le désordre : triées par date avant le regroupement', () => {
  const e = load([photo(4, 9, 40.4168, -3.7038), photo(0, 9, 38.72, -9.14), photo(2, 9, 41.15, -8.63)]);
  assert.deepEqual(e.stops.map(s => s.name), ['Lisbonne', 'Porto', 'Madrid']);
  for (let i = 1; i < e.photos.length; i++) assert.ok(e.photos[i].t >= e.photos[i - 1].t);
});

test('photo sans lieu avant la première, après la dernière, ou pile entre deux', () => {
  const e = load([photo(0, 6, null, null), photo(0, 9, 38.72, -9.14), photo(2, 9, 41.15, -8.63), photo(1, 9, null, null), photo(3, 9, null, null)]);
  const est = e.photos.filter(p => p.est);
  assert.equal(est[0].lat, 38.72, 'avant tout : la première photo située');
  assert.equal(est[1].lat, 38.72, 'à égale distance dans le temps : l\'étape d\'avant');
  assert.equal(est[2].lat, 41.15, 'après tout : la dernière');
  assert.deepEqual(e.stops.map(s => s.photos.length), [3, 2]);
});

test('photo sans lieu plus proche de l\'étape suivante : elle y va', () => {
  const e = load([photo(0, 9, 38.72, -9.14), photo(1, 20, null, null), photo(2, 9, 41.15, -8.63)]);
  assert.equal(e.photos.find(p => p.est).lat, 41.15);
});

test('photo sans lieu en tête d\'étape : elle ne fausse pas le centre', () => {
  const e = load([photo(0, 9, 38.72, -9.14), photo(2, 8, null, null), photo(2, 9, 41.15, -8.63), photo(2, 10, 41.17, -8.61)]);
  const porto = e.stops[1];
  assert.equal(porto.n, 2);
  assert.ok(Math.abs(porto.lat - 41.16) < 1e-9);
});

test('nom d\'étape : choisi > lieu de la photo > ville la plus proche ; nom effacé : retour au nom automatique', () => {
  const ph = [photo(0, 9, 35.0, 135.77, { place: 'Kyoto (Gion)' }), photo(1, 9, 34.69, 135.5)];
  let e = load(ph, { [ph[1].id]: 'Chez Yuki' });
  assert.deepEqual(e.stops.map(s => s.name), ['Kyoto (Gion)', 'Chez Yuki']);
  e = load(ph, { [ph[1].id]: '' });
  assert.equal(e.stops[1].name, e.stops[1].auto);
  assert.equal(e.stops[0].key, ph[0].id, 'clé stable : id de la première photo');
});

test('trajets : en vol au-delà de 250 km, par la route en dessous ; km = distance entre étapes', () => {
  const e = load([photo(0, 9, 48.857, 2.352), photo(1, 9, 49.44, 1.10), photo(3, 9, 43.30, 5.37)]);
  assert.equal(e.legs[0].fly, false); assert.equal(e.legs[0].pts.length, 3);
  assert.equal(e.legs[1].fly, true); assert.equal(e.legs[1].pts.length, 65);
  for (const L of e.legs) {
    assert.ok(Math.abs(L.km - geo.km(L.a, L.b)) < 1e-9);
    assert.ok(Math.abs(L.len - L.cum.at(-1)) < 1e-9 && L.cum.every((c, i) => !i || c >= L.cum[i - 1]), 'longueurs cumulées croissantes');
  }
});

test('au plus 5 photos montrées par étape, réparties, première et dernière comprises', () => {
  const ph = Array.from({ length: 12 }, (_, i) => photo(0, 8 + i / 2, 35.0 + i * 1e-4, 135.77));
  const s = load(ph).stops[0];
  assert.equal(s.show.length, 5);
  assert.equal(s.show[0], s.photos[0]); assert.equal(s.show.at(-1), s.photos.at(-1));
  assert.equal(new Set(s.show).size, 5);
  assert.equal(load(ph.slice(0, 2)).stops[0].show.length, 2);
});

test('durées : trajets entre 1,8 et 5,2 s, séjours proportionnels aux photos montrées', () => {
  const e = load([photo(0, 9, 48.857, 2.352), photo(0, 12, 48.87, 2.36), photo(1, 9, 49.44, 1.10), photo(3, 9, -33.86, 151.21)]);
  for (const o of e.seq) {
    if (o.kind === 'leg') assert.ok(o.dur >= 1.8 && o.dur <= 5.2, String(o.dur));
    if (o.kind === 'stay') assert.ok(Math.abs(o.dur - (0.6 + 1.6 * o.s.show.length)) < 1e-9);
  }
});

test('lecture : avant 0 et après la fin, l\'état reste défini', () => {
  const e = load([photo(0, 9, 38.72, -9.14), photo(2, 9, 41.15, -8.63)]);
  const a = trip.stateAt(-5), b = trip.stateAt(e.T + 100);
  assert.equal(a.o.kind, 'intro'); assert.ok(a.view.every(Number.isFinite));
  assert.equal(b.o.kind, 'outro'); assert.ok(b.end); assert.ok(b.view.every(Number.isFinite));
});

test('voyage vide : ni étape ni erreur', () => {
  const e = load([]);
  assert.equal(e.stops.length, 0); assert.equal(e.seq.length, 0); assert.equal(trip.stateAt(0), null);
  assert.deepEqual(trip.overview(), [500, 420, 900]);
  assert.equal(trip.summary().days, 0);
});

test('résumé : kilomètres = somme des trajets, pays sans doublon', () => {
  const e = load([photo(0, 9, 38.72, -9.14), photo(2, 9, 41.15, -8.63), photo(4, 9, 40.4168, -3.7038), photo(6, 9, 38.72, -9.14)]);
  const s = trip.summary();
  const total = Math.round(e.legs.reduce((a, L) => a + L.km, 0));
  assert.equal(Number(s.km.replace(/\D/g, '')), total);
  assert.deepEqual([...s.isos].sort(), ['ES', 'PT']);
  assert.equal(s.days, 7);
});

test('voyage d\'une journée : 1 jour ; photos à 23 h 59 puis 0 h 01 : 2 jours', () => {
  // les photos de test partent du 2 mai à 9 h : heure 0 = 9 h, heure 14,98 = 23 h 59
  load([photo(0, 0, 38.72, -9.14), photo(0, 12, 41.15, -8.63)]);
  assert.equal(trip.summary().days, 1);
  load([photo(0, 14.98, 38.72, -9.14), photo(0, 15.02, 41.15, -8.63)]);
  assert.equal(trip.summary().days, 2);
});

test('titre automatique : un pays, plusieurs, au plus trois, voyage sans pays', () => {
  load([photo(0, 9, 38.72, -9.14), photo(2, 9, 41.15, -8.63)]);
  assert.match(trip.autoTitle(), /^PT, mai 2026$|^Portugal, mai 2026$/);
  load([photo(0, 9, 48.857, 2.352), photo(1, 9, 50.85, 4.35), photo(2, 9, 52.37, 4.9), photo(3, 9, 52.52, 13.4), photo(4, 9, 48.21, 16.37)]);
  assert.equal(trip.autoTitle().split(',').length, 4, 'trois pays et le mois');
  load([photo(0, 9, 48.857, 2.352), photo(1, 9, 50.85, 4.35), photo(2, 9, 48.857, 2.352)]);
  assert.match(trip.autoTitle(), /^(FR|France), (BE|Belgique)/, 'le pays de départ revisité reste dans le titre');
  load([photo(0, 9, -48.5, -128)]);
  assert.equal(trip.autoTitle(), 'Mon voyage, mai 2026');
});

test('ville la plus proche : 15 km, « Près de » jusqu\'à 80 km, puis le pays, puis des coordonnées', () => {
  assert.equal(geo.nearest(48.857, 2.352).iso, 'FR');
  const far = geo.nearest(46.5, 2.5);
  assert.ok(far.iso === 'FR', 'en pleine campagne française : au moins le pays');
  const sea = geo.nearest(0.5, -30);
  assert.equal(sea.iso, ''); assert.match(sea.name, /^0\.5°N 30\.0°O$/);
  const saved = etat.CITIES; etat.CITIES = [];
  try { assert.equal(geo.nearest(1.234, 5.678).name, '1.23°, 5.68°', 'sans liste de villes'); } finally { etat.CITIES = saved; }
});

test('distances : symétrie, antipodes, ligne de changement de date', () => {
  const a = { lat: 48.857, lon: 2.352 }, b = { lat: 40.71, lon: -74.0 };
  assert.ok(Math.abs(geo.km(a, b) - geo.km(b, a)) < 1e-9);
  assert.ok(Math.abs(geo.km({ lat: 0, lon: 0 }, { lat: 0, lon: 180 }) - Math.PI * 6371) < 1e-6);
  assert.ok(geo.km({ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 }) < 25, 'de part et d\'autre de l\'antiméridien : voisins');
});
