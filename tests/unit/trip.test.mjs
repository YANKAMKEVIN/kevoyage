import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etat, trip, geo, japan, load, photo } from './helpers.mjs';

test('distances : Paris-Tokyo environ 9 700 km, un point à lui-même 0', () => {
  const d = geo.km({ lat: 48.857, lon: 2.352 }, { lat: 35.68, lon: 139.69 });
  assert.ok(d > 9600 && d < 9800, String(d));
  assert.equal(geo.km({ lat: 10, lon: 20 }, { lat: 10, lon: 20 }), 0);
});

test('ville la plus proche, en français', () => {
  assert.equal(geo.nearest(35.6595, 139.7005).name, 'Tokyo');
  assert.equal(geo.nearest(48.857, 2.352).name, 'Paris');
  assert.match(geo.nearest(48.95, 2.55).name, /^Près de /);
  assert.match(geo.nearest(-48.5, -128).name, /°S .*°O$/, 'en plein océan : des coordonnées');
});

test('étapes : photos prises au même endroit regroupées, nommées d\'après la ville', () => {
  const e = load(japan());
  assert.deepEqual(e.stops.slice(0, 3).map(s => s.name), ['Près de Paris', 'Tokyo', 'Kyoto']);
  assert.match(e.stops[3].name, /Nara|Osaka/);
  assert.deepEqual(e.stops.map(s => s.photos.length), [1, 3, 3, 1]);
  assert.equal(e.legs.length, 3);
  assert.ok(e.legs[0].fly && e.legs[0].km > 9000, 'Paris-Tokyo en avion');
  assert.ok(e.legs[2].fly === false && e.legs[2].km < 60, 'Kyoto-Nara par la route');
});

test('photo sans lieu : placée à l\'étape la plus proche dans le temps', () => {
  const e = load(japan());
  const p = e.photos.find(q => q.est);
  assert.ok(p);
  assert.ok(Math.abs(p.lat - 34.995) < 1e-9 && Math.abs(p.lon - 135.785) < 1e-9);
  assert.equal(e.stops[2].n, 2, 'elle ne déplace pas le centre de l\'étape');
});

test('noms d\'étapes choisis par l\'utilisateur : gardés', () => {
  const ph = japan(), e = load(ph, { [ph[1].id]: 'Shibuya' });
  assert.equal(e.stops[1].name, 'Shibuya');
});

test('séquence : intro, séjour à chaque étape, trajets, fin ; temps continu', () => {
  const e = load(japan());
  assert.deepEqual(e.seq.map(o => o.kind), ['intro', 'stay', 'leg', 'stay', 'leg', 'stay', 'leg', 'stay', 'outro']);
  for (let i = 1; i < e.seq.length; i++) assert.ok(Math.abs(e.seq[i].t0 - (e.seq[i - 1].t0 + e.seq[i - 1].dur)) < 1e-9);
  assert.ok(Math.abs(e.T - (e.seq.at(-1).t0 + e.seq.at(-1).dur)) < 1e-9);
});

test('lecture : tout le voyage se rejoue, chaque étape est atteinte dans l\'ordre', () => {
  const e = load(japan());
  let lastCur = -1, stays = new Set(), ended = false;
  for (let t = 0; t <= e.T; t += 0.05) {
    const st = trip.stateAt(t);
    assert.ok(st && st.view.every(Number.isFinite), `t=${t}`);
    assert.ok(st.cur >= lastCur, 'jamais en arrière'); lastCur = st.cur;
    if (st.o.kind === 'stay') { stays.add(st.o.s.i); assert.ok(st.ph >= 0 && st.ph < st.o.s.show.length); }
    if (st.o.kind === 'leg') assert.ok(st.part > 0 && st.part <= 1);
    if (st.end) ended = true;
  }
  assert.deepEqual([...stays], [0, 1, 2, 3]);
  assert.ok(ended);
});

test('point sur un trajet : départ, arrivée et milieu sur la courbe', () => {
  const e = load(japan()), L = e.legs[0];
  const [x0, y0] = trip.legPoint(L, 0), [x1, y1] = trip.legPoint(L, 1);
  assert.ok(Math.hypot(x0 - L.pts[0][0], y0 - L.pts[0][1]) < 1e-6);
  assert.ok(Math.hypot(x1 - L.pts.at(-1)[0], y1 - L.pts.at(-1)[1]) < 1e-6);
});

test('résumé et titre automatique', () => {
  const e = load(japan());
  const s = trip.summary();
  assert.equal(s.days, 8);
  assert.deepEqual(s.isos.sort(), ['FR', 'JP']);
  assert.ok(Number(s.km.replace(/\s/g, '').replace(/ /g, '')) > 10000);
  assert.equal(trip.autoTitle(), 'Japon, mai 2026', 'le pays de départ seul n\'entre pas dans le titre');
  assert.equal(trip.dayNo(e.stops[3].t0), 8);
});

test('voyage d\'une seule photo : une étape, ni trajet ni erreur', () => {
  const e = load([photo(0, 12, 43.296, 5.37)]);
  assert.equal(e.stops.length, 1); assert.equal(e.legs.length, 0);
  assert.deepEqual(e.seq.map(o => o.kind), ['intro', 'stay', 'outro']);
  assert.equal(trip.stateAt(e.T / 2).cur, 0);
});

test('voyage qui traverse le Pacifique : la ligne ne fait pas le tour du monde', () => {
  const e = load([photo(0, 9, 35.68, 139.69), photo(1, 9, 21.31, -157.86), photo(3, 9, 37.77, -122.42)]);
  for (const L of e.legs) assert.ok(Math.abs(L.b.x - L.a.x) < 500, 'pas de saut de plus d\'un demi-monde');
});
