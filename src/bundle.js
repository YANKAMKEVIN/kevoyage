// @ts-check
/** Rassemble les modules de l'appli en un seul script, pour le carnet téléchargé (un fichier HTML autonome).
 * L'ordre suit exactement celui où le navigateur évalue les modules (parcours en profondeur des import),
 * les import sont retirés et les export deviennent de simples déclarations : tous les noms de premier niveau
 * des modules sont uniques (vérifié par les tests). */

const IMPORT = /^import\s+(?:[\s\S]*?\s+from\s+)?'(\.\/[^']+)';[^\n]*\n?/gm;

/** Modules importés par un source, dans l'ordre. @param {string} src @returns {string[]} */
export function importsOf(src) { return [...src.matchAll(IMPORT)].map(m => m[1]); }

/** Retire import et export. @param {string} src */
export function strip(src) {
  return src.replace(IMPORT, '').replace(/^\/\/ @ts-check\n/m, '').replace(/^export\s+(?=(async\s+)?function\b|const\b|let\b|class\b)/gm, '');
}

/** @param {string} entry nom du module d'entrée (ex. 'main.js') @param {(name:string)=>Promise<string>} read lit un module de src/
 * @returns {Promise<{code:string,order:string[]}>} */
export async function bundle(entry, read) {
  /** @type {Map<string,string>} */
  const srcs = new Map();
  const order = [], seen = new Set();
  /** @param {string} name */
  async function visit(name) {
    if (seen.has(name)) return;
    seen.add(name);
    const src = await read(name); srcs.set(name, src);
    for (const dep of importsOf(src)) await visit(dep.slice(2));
    order.push(name);
  }
  await visit(entry);
  const code = order.map(n => `// ----- ${n}\n` + strip(/** @type {string} */ (srcs.get(n)))).join('\n');
  return { code, order };
}
