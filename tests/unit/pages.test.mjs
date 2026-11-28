// GitHub Pages sert le dépôt tel quel : chaque fichier que la page charge doit exister, avec un chemin relatif.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fitSize, MAX_SIDE, THUMB } from '../../src/sizes.js';

const root = new URL('../../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');

test('index.html : scripts et styles locaux présents, chemins relatifs (Pages sert sous /kevoyage/)', () => {
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]).filter(u => !/^https:\/\//.test(u));
  assert.ok(refs.length >= 5);
  for (const r of refs) {
    assert.ok(!r.startsWith('/'), `chemin absolu : ${r}`);
    assert.ok(existsSync(new URL(r, root)), `manquant : ${r}`);
  }
  assert.ok(existsSync(new URL('.nojekyll', root)), '.nojekyll : Pages ne filtre pas les fichiers');
});

test('fichiers chargés par le code : carte, villes, 19 photos peintes de la démo', () => {
  const src = readdirSync(new URL('src/', root)).filter(f => f.endsWith('.js')).map(f => readFileSync(new URL('src/' + f, root), 'utf8')).join('\n');
  for (const f of [...src.matchAll(/(?:fetch|get)\('([\w.-]+\.(?:json|css|js))'\)/g)].map(m => m[1])) assert.ok(existsSync(new URL(f, root)), f);
  for (let i = 1; i <= 19; i++) assert.ok(existsSync(new URL(`art/demo_${String(i).padStart(2, '0')}.webp`, root)), `photo ${i}`);
  JSON.parse(readFileSync(new URL('world.json', root), 'utf8'));
  const cities = JSON.parse(readFileSync(new URL('cities.json', root), 'utf8'));
  assert.ok(cities.length > 7000 && cities.every(c => typeof c[0] === 'string' && Math.abs(c[1]) <= 90 && Math.abs(c[2]) <= 180));
});

test('tailles : photo réduite à 1000 px sans agrandir, miniature assez nette pour un DPR de 2', () => {
  assert.deepEqual(fitSize(4032, 3024, MAX_SIDE), [1000, 750]);
  assert.deepEqual(fitSize(3024, 4032, MAX_SIDE), [750, 1000]);
  assert.deepEqual(fitSize(640, 480, MAX_SIDE), [640, 480], 'jamais agrandie');
  assert.deepEqual(fitSize(20000, 10, MAX_SIDE), [1000, 1], 'panorama extrême : au moins 1 px');
  assert.deepEqual(fitSize(0, 100, MAX_SIDE), [1, 1]); assert.deepEqual(fitSize(NaN, 100, MAX_SIDE), [1, 1]);
  assert.ok(THUMB >= 22 * 2 * 2, 'rayon 22 px × DPR 2');
});
