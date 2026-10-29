import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const forbidden = ['__SQL_DESK_DEV_ONLY__', '?seed=', 'debugSeedOverride', '__SQL_DESK_SHORT_SET__'];
const assets = await readdir('dist/assets');
let checked = 0;
for (const name of assets) {
  if (!/\.(js|html)$/.test(name)) continue;
  const text = await readFile(`dist/assets/${name}`, 'utf8');
  for (const marker of forbidden) assert(!text.includes(marker), `Development hook leaked into ${name}: ${marker}`);
  checked += 1;
}
assert(checked > 0, 'No production JavaScript found');
const html = await readFile('dist/index.html', 'utf8');
assert(!html.includes('https://'), 'Unexpected external resource in production HTML');

// The offline worker ships too. Its precache list must hold the app shell only, never the SQL engine or the editor.
const worker = await readFile('dist/sw.js', 'utf8');
for (const marker of forbidden) assert(!worker.includes(marker), `Development hook leaked into sw.js: ${marker}`);
const shell = worker.match(/^const SHELL = (\[.*\]);$/m);
assert(shell, 'The offline worker has no precache list');
const precached = JSON.parse(shell[1]);
for (const engineFile of ['pglite', 'libpg-query', 'SqlEditor', 'game.worker']) {
  assert(!precached.some((url) => url.includes(engineFile)), `The offline worker precaches the engine: ${engineFile}`);
}

// The engine lab is a test page. A shipped build leaves it out; the test and spike builds set ENGINE_LAB=1.
if (process.env.ENGINE_LAB !== '1') assert(!existsSync('dist/engine-lab.html'), 'engine-lab.html is in the shipped build');

console.log(`PASS: scanned ${checked} production JS assets and the offline worker; development-hook markers absent; the engine is not precached.`);
