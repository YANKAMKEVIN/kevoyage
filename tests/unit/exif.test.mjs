import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { withExif } from '../exif.mjs';

vm.runInThisContext(readFileSync(new URL('../../exifr.min.js', import.meta.url), 'utf8'), { importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
const jpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]);

test('les photos de test portent date et lieu, lus par la même bibliothèque que l\'appli', async () => {
  const m = await globalThis.exifr.parse(withExif(jpeg, { date: '2026:06:01 10:30:00', lat: 38.7223, lon: -9.1393 }), { tiff: true, exif: true, gps: true });
  assert.ok(Math.abs(m.latitude - 38.7223) < 1e-3 && Math.abs(m.longitude + 9.1393) < 1e-3);
  assert.equal(m.DateTimeOriginal.getFullYear(), 2026);
  const s = await globalThis.exifr.parse(withExif(jpeg, { lat: -33.86, lon: 151.21 }), { gps: true });
  assert.ok(s.latitude < 0 && s.longitude > 0, 'hémisphères sud et est');
  const d = await globalThis.exifr.parse(withExif(jpeg, { date: '2026:06:02 08:00:00' }), { tiff: true, exif: true, gps: true });
  assert.equal(d.latitude, undefined, 'photo sans lieu');
});
