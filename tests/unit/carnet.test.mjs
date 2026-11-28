// Le carnet téléchargé : un seul fichier HTML, sûr quel que soit le titre ou le contenu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { carnetHtml, carnetFileName, escHtml, safeScript, inlineJson, FONTS } from '../../src/carnet.js';
import { serialize, parse } from '../../src/store.js';
import { bundle } from '../../src/bundle.js';
import { japan } from './helpers.mjs';

const scripts = html => [...html.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const make = (title = 'Japon, mai 2026', extra = {}) => {
  const data = { world: '{"type":"Topology"}', cities: [['Tokyo', 35.68, 139.69, 'JP', 9e6]], trip: serialize(title, {}, japan()) };
  return { data, html: carnetHtml({ title, shell: '<div id="app"></div>', css: 'body{color:red}', libs: ['var d3={};', 'var topojson={};'], data, app: 'console.log(1)', ...extra }) };
};

test('nom du fichier : sans accents ni espaces, jamais vide, borné', () => {
  assert.equal(carnetFileName('Ibérie 2026'), 'kevoyage-iberie-2026.html');
  assert.equal(carnetFileName('Japon, mai 2026'), 'kevoyage-japon-mai-2026.html');
  assert.equal(carnetFileName('  Été à Noël !  '), 'kevoyage-ete-a-noel.html');
  assert.equal(carnetFileName(''), 'kevoyage-carnet.html');
  assert.equal(carnetFileName('🌏🗾'), 'kevoyage-carnet.html');
  assert.equal(carnetFileName('../../etc/passwd'), 'kevoyage-etc-passwd.html', 'pas de chemin');
  assert.ok(carnetFileName('a'.repeat(500)).length <= 'kevoyage-.html'.length + 80);
  assert.ok(!/-\.html$/.test(carnetFileName('abc '.repeat(40))), 'pas de tiret final après coupe');
});

test('échappements HTML, scripts et JSON', () => {
  assert.equal(escHtml('<b>"Tom" & \'Jerry\'</b>'), '&#60;b&#62;&#34;Tom&#34; &#38; &#39;Jerry&#39;&#60;/b&#62;');
  assert.equal(safeScript('a="</script><script>alert(1)</script>"'), 'a="<\\/script><script>alert(1)<\\/script>"');
  assert.equal(safeScript('x</SCRIPT>'), 'x<\\/SCRIPT>');
  const j = inlineJson({ t: '</script>  ' });
  assert.ok(!j.includes('<') && !j.includes(' ') && !j.includes(' '));
  assert.deepEqual(JSON.parse(j), { t: '</script>  ' });
});

test('structure : titre, polices, styles, bibliothèques, données puis appli', () => {
  const { html } = make();
  assert.match(html, /^<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">/);
  assert.match(html, /<title>Japon, mai 2026<\/title>/);
  assert.ok(html.includes(FONTS) && html.includes('<style>body{color:red}</style>'));
  const s = scripts(html);
  assert.equal(s.length, 4);
  assert.deepEqual(s.slice(0, 2), ['var d3={};', 'var topojson={};']);
  assert.match(s[2], /^window\.KEV=/);
  assert.equal(s[3], 'console.log(1)');
  assert.ok(html.indexOf('<div id="app">') < html.indexOf('<script>'), 'la page avant les scripts');
});

test('titre piégé : échappé dans <title>, données relues à l\'identique', () => {
  const evil = '</title><script>alert(1)</script> & « Noël »';
  const { html, data } = make(evil);
  assert.ok(!html.includes('<script>alert(1)'));
  const kev = JSON.parse(scripts(html)[2].replace(/^window\.KEV=/, ''));
  assert.deepEqual(kev, data);
  assert.equal(parse(kev.trip).title, evil, 'le voyage du carnet passe la validation');
});

test('bibliothèque ou style contenant </script> ou </style> : la page reste entière', () => {
  const { html } = make('x', { libs: ['var s="</script>";'], css: 'a::after{content:"</style>"}' });
  assert.equal(scripts(html).length, 3);
  assert.ok(!html.includes('"</style>"'));
});

test('carnet réel : appli rassemblée, photos et villes embarquées, sans fichier externe hormis les polices', async () => {
  const root = new URL('../../', import.meta.url), read = async f => readFileSync(new URL('src/' + f, root), 'utf8');
  const app = (await bundle('main.js', read)).code;
  const { html } = make('Japon', { app, libs: [readFileSync(new URL('d3.min.js', root), 'utf8')] });
  const ext = [...html.matchAll(/(?:src|href)="(https?:[^"]+|[^"#][^"]*\.(?:js|css|json))"/g)].map(m => m[1]);
  assert.deepEqual(ext, [FONTS]);
  assert.equal(scripts(html).length, 3, 'd3 minifié ne casse pas les balises');
  assert.ok(html.includes('data:image/jpeg;base64,'));
});
