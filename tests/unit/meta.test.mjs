// Dates EXIF bizarres, positions GPS douteuses : ce que l'appli garde d'une photo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EXIF_OPTS, exifDate, validGps, photoFields, MIN_YEAR } from '../../src/meta.js';
import { withExif } from '../exif.mjs';

vm.runInThisContext(readFileSync(new URL('../../exifr.min.js', import.meta.url), 'utf8'), { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]);
const local = (...a) => new Date(...a).getTime();

test('date EXIF normale : heure locale de l\'appareil, secondes comprises', () => {
  assert.equal(exifDate('2026:06:01 10:30:15'), local(2026, 5, 1, 10, 30, 15));
  assert.equal(exifDate('2026-06-01T10:30:15'), local(2026, 5, 1, 10, 30, 15), 'format ISO (XMP, logiciels)');
  assert.equal(exifDate('2026:06:01 10:30'), local(2026, 5, 1, 10, 30));
  assert.equal(exifDate('2026:06:01'), local(2026, 5, 1), 'date seule : minuit');
});

test('fuseau et fractions de seconde : ignorés, l\'heure vécue est gardée', () => {
  assert.equal(exifDate('2026:06:01 21:15:00+09:00'), local(2026, 5, 1, 21, 15));
  assert.equal(exifDate('2026:06:01 21:15:00.123'), local(2026, 5, 1, 21, 15));
  assert.equal(exifDate('  2026:06:01 21:15:00\0'), local(2026, 5, 1, 21, 15), 'blancs et zéro final');
});

test('horloge jamais réglée, champs vides ou impossibles : pas de date', () => {
  for (const v of ['0000:00:00 00:00:00', '    :  :     :  :  ', '', '1970:01:01 00:00:00', '1899:11:30 00:00:00',
    '2026:13:01 10:00:00', '2026:00:10 10:00:00', '2026:02:30 10:00:00', '2026:04:31 08:00:00', '2026:06:01 24:00:00',
    '2026:06:01 10:60:00', '2026:06:01 10:00:61', '2101:01:01 00:00:00', 'hier', '20260601']) assert.equal(exifDate(v), null, JSON.stringify(v));
  for (const v of [undefined, null, 0, 1.7e12, {}, [], new Date(NaN), new Date(1899, 10, 30)]) assert.equal(exifDate(v), null, String(v));
});

test('29 février : accepté seulement les années bissextiles', () => {
  assert.equal(exifDate('2028:02:29 12:00:00'), local(2028, 1, 29, 12));
  assert.equal(exifDate('2026:02:29 12:00:00'), null);
});

test('Date déjà convertie (autre bibliothèque) : acceptée si plausible', () => {
  assert.equal(exifDate(new Date(2026, 5, 1, 9)), local(2026, 5, 1, 9));
  assert.equal(exifDate(new Date(MIN_YEAR - 1, 0, 1)), null);
});

test('position GPS : bornes, nombres finis, et « 0, 0 » refusé', () => {
  assert.ok(validGps(38.72, -9.14)); assert.ok(validGps(-33.86, 151.21)); assert.ok(validGps(90, 180)); assert.ok(validGps(0, 12));
  for (const [a, b] of [[0, 0], [91, 0], [0, 181], [-91, 0], [NaN, 1], [1, Infinity], ['38', '-9'], [null, null], [undefined, 2], [38.7, null]])
    assert.equal(validGps(a, b), false, `${a}, ${b}`);
});

test('champs d\'une photo : date de prise de vue, sinon d\'autres dates, sinon celle du fichier', () => {
  const lm = local(2026, 6, 14, 8);
  assert.deepEqual(photoFields({ DateTimeOriginal: '2026:06:01 10:00:00', latitude: 41.15, longitude: -8.63 }, lm),
    { t: local(2026, 5, 1, 10), noDate: false, lat: 41.15, lon: -8.63, est: false });
  assert.equal(photoFields({ DateTimeOriginal: '0000:00:00 00:00:00', CreateDate: '2026:06:02 11:00:00' }, lm).t, local(2026, 5, 2, 11), 'date de création en secours');
  assert.equal(photoFields({ ModifyDate: '2026:06:03 12:00:00' }, lm).t, local(2026, 5, 3, 12));
  const none = photoFields({ DateTimeOriginal: '0000:00:00 00:00:00' }, lm);
  assert.equal(none.t, lm); assert.equal(none.noDate, true, 'signalée comme sans date');
  assert.deepEqual(photoFields(null, lm), { t: lm, noDate: true, lat: 0, lon: 0, est: true }, 'EXIF illisible');
  assert.equal(photoFields(undefined, NaN).t, 0);
});

test('photo sans lieu ou à moitié géolocalisée : estimée, jamais de null dans le voyage', () => {
  const p = photoFields({ DateTimeOriginal: '2026:06:01 10:00:00', latitude: 38.7, longitude: null }, 0);
  assert.equal(p.est, true); assert.equal(p.lat, 0); assert.equal(p.lon, 0);
  assert.equal(photoFields({ latitude: 0, longitude: 0 }, 0).est, true, 'île nulle');
});

test('vraies photos JPEG lues par exifr avec les options de l\'appli', async () => {
  const read = async o => photoFields(await globalThis.exifr.parse(withExif(jpeg, o), EXIF_OPTS), 123);
  const ok = await read({ date: '2026:06:01 10:30:00', lat: 38.7223, lon: -9.1393 });
  assert.equal(ok.t, local(2026, 5, 1, 10, 30)); assert.ok(Math.abs(ok.lat - 38.7223) < 1e-3 && Math.abs(ok.lon + 9.1393) < 1e-3);
  const zero = await read({ date: '0000:00:00 00:00:00', lat: 35.5, lon: 139.7 });
  assert.equal(zero.noDate, true, 'sans réglage d\'horloge : pas 1899'); assert.equal(zero.t, 123); assert.equal(zero.est, false);
  const blank = await read({ date: '    :  :     :  :  ' });
  assert.equal(blank.noDate, true); assert.equal(blank.est, true);
  const overflow = await read({ date: '2026:13:45 99:00:00', lat: -33.86, lon: 151.21 });
  assert.equal(overflow.noDate, true, 'mois 13 refusé, pas glissé à l\'année suivante');
  assert.ok(overflow.lat < 0 && overflow.lon > 0);
});
