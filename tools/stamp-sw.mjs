// Writes the list of game files and a hash of their contents into sw.js, so the
// offline copy on players' devices updates whenever the game changes:
//   node tools/stamp-sw.mjs
// tests/offline.test.mjs fails while the stamp is out of date.

import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROOT_FILES = ['index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
const DIRS = { css: '.css', js: '.js', fonts: '.woff2', 'assets/gems': '.webp' };
const BLOCK = /\/\/ stamp:start[^\n]*\n[\s\S]*?\/\/ stamp:end/;

export function gameFiles() {
  const inDirs = Object.entries(DIRS).flatMap(([dir, ext]) =>
    readdirSync(ROOT + dir).filter((f) => f.endsWith(ext)).map((f) => `${dir}/${f}`));
  return [...ROOT_FILES, ...inDirs.sort()];
}

// sw.js with its stamp block brought up to date
export function stamped() {
  const files = gameFiles();
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update(readFileSync(ROOT + f));
  const version = hash.digest('hex').slice(0, 12);
  const list = files.map((f) => `  '${f}',`).join('\n');
  const sw = readFileSync(ROOT + 'sw.js', 'utf8');
  const head = sw.match(BLOCK)[0].split('\n')[0];
  return sw.replace(BLOCK, `${head}\nconst VERSION = '${version}';\nconst FILES = [\n${list}\n];\n// stamp:end`);
}

export const current = () => readFileSync(ROOT + 'sw.js', 'utf8');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = stamped();
  if (next === current()) console.log('sw.js is up to date');
  else { writeFileSync(ROOT + 'sw.js', next); console.log(`sw.js stamped: ${next.match(/VERSION = '(\w+)'/)[1]}`); }
}
