import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const assets = await readdir('dist/assets');
const forbidden = ['__SQL_DESK_DEV_ONLY__', '?seed=', 'debugSeedOverride', '__SQL_DESK_SHORT_SET__'];
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
console.log(`PASS: scanned ${checked} production JS assets; development-hook markers absent.`);
