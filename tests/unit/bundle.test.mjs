import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundle, importsOf, strip } from '../../src/bundle.js';

const src = new URL('../../src/', import.meta.url);
const read = async f => readFileSync(new URL(f, src), 'utf8');

test('les import sont lus, y compris sur plusieurs lignes et sans nom', () => {
  assert.deepEqual(importsOf("import { a,\n b } from './x.js';\nimport './y.js';\nconst s = \"import z from './no.js'\";\n"), ['./x.js', './y.js']);
  // import sans nom suivi d'un import nommé : le premier n'avale pas le second (bug corrigé en 1.3.0)
  assert.deepEqual(importsOf("import './a.js';\nimport { b } from './b.js';\n"), ['./a.js', './b.js']);
  assert.equal(strip("import './a.js';\nimport { b } from './b.js';\nconst c = 1;\n"), 'const c = 1;\n');
  assert.equal(strip("// @ts-check\nimport { a } from './x.js';\nexport const b = 1;\nexport async function f() {}\n"), 'const b = 1;\nasync function f() {}\n');
});

test('carnet : tous les modules, dans l\'ordre d\'évaluation du navigateur', async () => {
  const { order } = await bundle('main.js', read);
  const all = readdirSync(src).filter(f => f.endsWith('.js'));
  assert.deepEqual([...order].sort(), [...all].sort(), 'chaque module est embarqué');
  assert.equal(order.at(-1), 'main.js');
  const deps = new Map();
  for (const f of order) deps.set(f, importsOf(await read(f)).map(x => x.slice(2)));
  const reaches = (from, to, seen = new Set()) => from === to || (!seen.has(from) && (seen.add(from), deps.get(from).some(d => reaches(d, to, seen))));
  for (const f of order) for (const d of deps.get(f))
    // un module est placé après ses dépendances, sauf en cas de cycle (comme dans le navigateur)
    if (order.indexOf(d) > order.indexOf(f)) assert.ok(reaches(d, f), `${d} devrait précéder ${f}`);
});

test('carnet : un seul script valide, sans import, sans nom en double', async () => {
  const { code } = await bundle('main.js', read);
  assert.ok(!/^\s*(import|export)\s/m.test(code));
  const dir = mkdtempSync(join(tmpdir(), 'kv-'));
  const file = join(dir, 'carnet.mjs'); writeFileSync(file, code);
  const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});
