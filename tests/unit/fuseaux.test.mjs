// Fuseau de la prise de vue (OffsetTimeOriginal) : ordre du voyage, jours vécus sur place, heure d'été.
// Le navigateur est placé à New York exprès : ses changements d'heure (8 mars, 1er novembre 2026)
// ne tombent pas les mêmes jours qu'en Europe, et son fuseau ne doit jamais décider des jours du voyage.
process.env.TZ = 'America/New_York';
const { test } = await import('node:test');
const assert = (await import('node:assert/strict')).default;
const { readFileSync } = await import('node:fs');
const vm = (await import('node:vm')).default;
const { trip, load, photo, etat } = await import('./helpers.mjs');
const { parseOffset, wall, dayIndex, daysBetween, inferZones, validTz } = await import('../../src/temps.js');
const { photoFields, exifWall, EXIF_OPTS } = await import('../../src/meta.js');
const { fmtDay, fmtHour } = await import('../../src/fmt.js');
const { withExif } = await import('../exif.mjs');

vm.runInThisContext(readFileSync(new URL('../../exifr.min.js', import.meta.url), 'utf8'), { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });

/** Photo prise à l'heure locale « date » dans le fuseau « off » (ex. '+09:00'), à lat/lon. */
const shot = (date, off, lat, lon) => ({ ...photo(0, 0, lat, lon), ...photoFields({ DateTimeOriginal: date, OffsetTimeOriginal: off, latitude: lat, longitude: lon }, 0) });
const TOKYO = [35.6595, 139.7005], KYOTO = [34.995, 135.785], SF = [37.7749, -122.4194], PARIS = [48.8566, 2.3522], PORTO = [41.1579, -8.6291];

test('le fuseau du navigateur de test est bien New York', () => {
  assert.equal(new Date(2026, 6, 1).getTimezoneOffset(), 240);
  assert.equal(new Date(2026, 0, 1).getTimezoneOffset(), 300);
});

test('décalages EXIF : formats acceptés et refusés', () => {
  assert.equal(parseOffset('+09:00'), 540);
  assert.equal(parseOffset('-05:00'), -300);
  assert.equal(parseOffset('+05:45'), 345, 'Népal');
  assert.equal(parseOffset('-03:30'), -210, 'Terre-Neuve');
  assert.equal(parseOffset('+0530'), 330, 'sans deux-points');
  assert.equal(parseOffset('+14:00'), 840, 'Kiribati');
  assert.equal(parseOffset('-12:00'), -720);
  assert.equal(parseOffset('Z'), 0);
  assert.equal(parseOffset(' +01:00\0'), 60, 'blancs et zéro final');
  for (const v of ['', '   :  ', '+15:00', '-13:00', '+09:07', '+09:60', '09:00', '+9:00', 'UTC', null, undefined, 540, {}])
    assert.equal(parseOffset(v), null, JSON.stringify(v));
  assert.ok(validTz(0) && validTz(840) && validTz(-720));
  assert.ok(!validTz(841) && !validTz(1.5) && !validTz('60') && !validTz(undefined));
});

test('photo avec fuseau : instant réel, heure vécue gardée pour l\'affichage', () => {
  const f = photoFields({ DateTimeOriginal: '2026:06:01 23:30:00', OffsetTimeOriginal: '+09:00' }, 0);
  assert.equal(f.tz, 540);
  assert.equal(f.t, Date.UTC(2026, 5, 1, 14, 30), 'instant réel : 14 h 30 UTC');
  assert.equal(wall(f), Date.UTC(2026, 5, 1, 23, 30));
  assert.equal(fmtHour.format(wall(f)), '23:30', 'l\'heure affichée est celle de Tokyo, pas celle du navigateur');
  assert.match(fmtDay.format(wall(f)), /1 juin/);
});

test('fuseau écrit dans la date elle-même (XMP, logiciels) ; à défaut, champ du fuseau de la date utilisée', () => {
  assert.deepEqual(exifWall('2026-06-01T10:30:15+09:00'), { w: Date.UTC(2026, 5, 1, 10, 30, 15), tz: 540 });
  assert.deepEqual(exifWall('2026-06-01T10:30:15.250-03:30'), { w: Date.UTC(2026, 5, 1, 10, 30, 15), tz: -210 });
  assert.deepEqual(exifWall('2026:06:01 10:30:15'), { w: Date.UTC(2026, 5, 1, 10, 30, 15), tz: null });
  assert.equal(photoFields({ DateTimeOriginal: '2026-06-01T10:00:00Z', OffsetTimeOriginal: '+09:00' }, 0).tz, 0, 'le texte de la date l\'emporte');
  assert.equal(photoFields({ CreateDate: '2026:06:01 10:00:00', OffsetTimeDigitized: '+02:00', OffsetTimeOriginal: '+09:00' }, 0).tz, 120, 'chaque date avec son propre champ');
  assert.equal(photoFields({ ModifyDate: '2026:06:01 10:00:00', OffsetTime: '-07:00' }, 0).tz, -420);
  assert.equal('tz' in photoFields({ DateTimeOriginal: '2026:06:01 10:00:00', OffsetTimeOriginal: '   :  ' }, 0), false, 'fuseau vide : ignoré');
  assert.equal('tz' in photoFields({ DateTimeOriginal: '0000:00:00 00:00:00', OffsetTimeOriginal: '+09:00' }, 5), false, 'sans date, pas de fuseau');
});

test('fuseau lu par le vrai exifr dans un JPEG (OffsetTimeOriginal)', async () => {
  const jpeg = withExif(Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]), { date: '2026:06:01 23:30:00', offset: '+09:00', lat: TOKYO[0], lon: TOKYO[1] });
  const f = photoFields(await exifr.parse(jpeg, EXIF_OPTS), 0);
  assert.equal(f.tz, 540); assert.equal(f.t, Date.UTC(2026, 5, 1, 14, 30)); assert.equal(f.est, false);
});

test('jours vécus à Tokyo : 23 h 30 et 0 h 30 sont deux jours, même vus depuis New York', () => {
  const a = shot('2026:06:01 23:30:00', '+09:00', ...TOKYO), b = shot('2026:06:02 00:30:00', '+09:00', ...TOKYO);
  // à New York, les deux photos sont le 1er juin (10 h 30 et 11 h 30) : l'ancien calcul les mettait le même jour
  assert.equal(new Date(a.t).getDate(), new Date(b.t).getDate());
  assert.equal(daysBetween(a, b), 1);
  load([a, b]);
  assert.equal(trip.summary().days, 2);
  assert.equal(trip.dayNo(a), 1); assert.equal(trip.dayNo(b), 2);
});

test('vol vers l\'ouest au-dessus du Pacifique : arrivée à San Francisco « avant » le départ de Tokyo à l\'heure locale, mais après en vrai', () => {
  const dep = shot('2026:06:10 18:00:00', '+09:00', ...TOKYO);   // 09:00 UTC
  const arr = shot('2026:06:10 11:00:00', '-07:00', ...SF);      // 18:00 UTC, même date, heure locale plus petite
  const tour = shot('2026:06:10 15:00:00', '-07:00', ...SF);
  const e = load([arr, tour, dep]);
  assert.deepEqual(e.photos.map(p => p.id), [dep.id, arr.id, tour.id], 'ordre réel : Tokyo puis San Francisco');
  assert.equal(e.stops.length, 2); assert.equal(e.legs.length, 1);
  assert.ok(e.legs[0].fly && e.legs[0].km > 8000);
  assert.equal(trip.summary().days, 1, 'le 10 juin à Tokyo et le 10 juin à San Francisco : un seul jour');
  assert.equal(trip.dayNo(arr), 1);
});

test('vol vers l\'est : Paris le soir, Tokyo le lendemain après-midi, jours comptés sur place', () => {
  const p0 = shot('2026:06:01 09:00:00', '+02:00', ...PARIS), p1 = shot('2026:06:01 20:00:00', '+02:00', ...PARIS);
  const t0 = shot('2026:06:02 17:00:00', '+09:00', ...TOKYO), t1 = shot('2026:06:03 08:00:00', '+09:00', ...TOKYO);
  const e = load([t1, p1, t0, p0]);
  assert.deepEqual(e.photos.map(p => p.id), [p0.id, p1.id, t0.id, t1.id]);
  assert.equal(trip.summary().days, 3);
  assert.deepEqual([p0, p1, t0, t1].map(trip.dayNo), [1, 1, 2, 3]);
  assert.equal(e.stops[1].w0, Date.UTC(2026, 5, 2, 17), 'début d\'étape à l\'heure de Tokyo');
});

test('heure d\'été sur place (Portugal, 29 mars 2026) : 3 jours, quel que soit le fuseau du navigateur', () => {
  const a = shot('2026:03:28 10:00:00', '+00:00', ...PORTO), b = shot('2026:03:29 23:00:00', '+01:00', ...PORTO), c = shot('2026:03:30 10:00:00', '+01:00', ...PORTO);
  load([a, b, c]);
  assert.equal(trip.summary().days, 3);
  assert.deepEqual([a, b, c].map(trip.dayNo), [1, 2, 3]);
});

test('retour à l\'heure d\'hiver sur place (25 octobre 2026, jour de 25 h) : la nuit en double ne crée pas de jour', () => {
  const a = shot('2026:10:25 01:30:00', '+02:00', ...PARIS), b = shot('2026:10:25 02:30:00', '+01:00', ...PARIS);
  const c = shot('2026:10:25 23:59:00', '+01:00', ...PARIS), d = shot('2026:10:26 00:01:00', '+01:00', ...PARIS);
  load([d, c, b, a]);
  assert.equal(trip.summary().days, 2);
  assert.deepEqual([a, b, c, d].map(trip.dayNo), [1, 1, 1, 2]);
});

test('changement d\'heure du navigateur (New York, 8 mars 2026) sans effet sur un voyage en Asie', () => {
  const a = shot('2026:03:07 12:00:00', '+09:00', ...TOKYO), b = shot('2026:03:08 12:00:00', '+09:00', ...KYOTO), c = shot('2026:03:09 12:00:00', '+09:00', ...KYOTO);
  load([a, b, c]);
  assert.equal(trip.summary().days, 3);
  assert.deepEqual([a, b, c].map(trip.dayNo), [1, 2, 3]);
});

test('photo sans fuseau (vieil appareil) au milieu de photos avec fuseau : prend celui de la plus proche, heure affichée inchangée', () => {
  const t0 = shot('2026:06:10 18:00:00', '+09:00', ...TOKYO);
  const sf = shot('2026:06:10 11:00:00', '-07:00', ...SF);
  const old = { ...photo(0, 0, ...SF), ...photoFields({ DateTimeOriginal: '2026:06:10 12:00:00', latitude: SF[0], longitude: SF[1] }, 0) };
  assert.equal('tz' in old, false);
  const shown = fmtHour.format(wall(old));
  assert.equal(shown, '12:00');
  const e = load([t0, old, sf]);
  assert.equal(old.tz, -420, 'fuseau de San Francisco, la photo connue la plus proche à l\'heure locale');
  assert.equal(fmtHour.format(wall(old)), shown);
  assert.deepEqual(e.photos.map(p => p.id), [t0.id, sf.id, old.id]);
});

test('aucune photo avec fuseau : rien ne change (heure de l\'appareil, comme avant)', () => {
  const ps = [photo(0, 9, ...PARIS), photo(1, 9, ...PORTO)];
  const before = ps.map(p => p.t);
  assert.equal(inferZones(ps), 0);
  assert.deepEqual(ps.map(p => p.t), before);
  assert.ok(ps.every(p => !('tz' in p)));
});

test('photo sans date (datée par le fichier) : jamais déplacée par un fuseau deviné', () => {
  const t0 = shot('2026:06:10 18:00:00', '+09:00', ...TOKYO);
  const nd = { ...photo(0, 0, ...TOKYO), noDate: true, t: Date.UTC(2026, 5, 10, 12) };
  assert.equal(inferZones([t0, nd]), 0);
  assert.equal(nd.t, Date.UTC(2026, 5, 10, 12)); assert.equal('tz' in nd, false);
});

test('nombre lu dans le fuseau du navigateur : compatibilité avec les voyages d\'avant', () => {
  const t = new Date(2026, 2, 8, 23, 0).getTime(); // 8 mars, jour de 23 h à New York
  assert.equal(wall(t), Date.UTC(2026, 2, 8, 23, 0));
  assert.equal(dayIndex(t) - dayIndex(new Date(2026, 2, 7, 1, 0).getTime()), 1);
  assert.equal(etat.day1 >= etat.day0, true);
});

test('ligne de changement de date : une photo sans fuseau à Honolulu prend le fuseau d\'Honolulu, pas celui d\'Auckland', () => {
  const AKL = [-36.8485, 174.7633], HNL = [21.3069, -157.8583];
  const akl = shot('2026:06:20 20:00:00', '+12:00', ...AKL);   // 08:00 UTC le 20
  const hnl = shot('2026:06:19 22:00:00', '-10:00', ...HNL);   // 08:00 UTC le 20 + 0 : après le vol, la veille à l'heure locale
  const hnl2 = shot('2026:06:20 09:00:00', '-10:00', ...HNL);  // 19:00 UTC le 20
  // sans fuseau, à Honolulu, le 20 à 16 h locales : à l'heure locale, la photo connue la plus proche est celle d'Auckland (20 h)
  const old = { ...photo(0, 0, ...HNL), ...photoFields({ DateTimeOriginal: '2026:06:20 16:00:00', latitude: HNL[0], longitude: HNL[1] }, 0) };
  const e = load([akl, hnl, hnl2, old]);
  assert.equal(old.tz, -600, 'fuseau pris à une photo voisine dans l\'espace');
  assert.deepEqual(e.photos.map(p => p.id), [akl.id, hnl.id, hnl2.id, old.id]);
  assert.equal(e.stops.length, 2);
  // sans lieu, elle prend la plus proche dans le temps
  const lost = { ...photo(0, 0, null, null), ...photoFields({ DateTimeOriginal: '2026:06:20 19:00:00' }, 0) };
  inferZones([akl, hnl, lost]);
  assert.equal(lost.tz, 720);
});
