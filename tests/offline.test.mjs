// Run with: node tests/offline.test.mjs
// Players keep an offline copy of the game, which only updates when sw.js
// changes, so a game change without a new stamp would never reach them.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stamped, current, gameFiles } from '../tools/stamp-sw.mjs';

assert.equal(current(), stamped(), 'sw.js is out of date: run node tools/stamp-sw.mjs');

// every local file the page links must be in the offline copy
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const linked = [...html.matchAll(/(?:href|src)="([^":#]+)"/g)].map((m) => m[1]);
const files = new Set(gameFiles());
for (const f of linked) assert.ok(files.has(f), `${f} is linked from index.html but not cached`);
assert.ok(!/https?:\/\//.test(readFileSync(new URL('../css/fonts.css', import.meta.url), 'utf8')), 'fonts must be local');

console.log('offline copy is complete and up to date');
