// Publishes a built site to the private bucket, then invalidates the paths that are not content-hashed.
// Usage: SITE_BUCKET=<bucket> DISTRIBUTION_ID=<id> node scripts/deploy/publish.mjs [dist]
// The workflow sets both variables from GitHub; nothing here is stored in the repository.
import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { INVALIDATED, prunable, publishPlan } from './plan.mjs';

const run = promisify(execFile);
const aws = async (args) => (await run('aws', args, { maxBuffer: 16 * 1024 * 1024 })).stdout;
const dist = process.argv[2] ?? 'dist';
const bucket = process.env.SITE_BUCKET;
const distribution = process.env.DISTRIBUTION_ID;
if (!bucket || !distribution) throw new Error('SITE_BUCKET and DISTRIBUTION_ID must be set.');

async function walk(directory, prefix = '') {
  const names = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) names.push(...await walk(directory, relative));
    else names.push(relative);
  }
  return names;
}

const plan = publishPlan(await walk(dist));
for (const entry of plan) {
  const args = ['s3', 'cp', join(dist, entry.file), `s3://${bucket}/${entry.key}`, '--content-type', entry.contentType, '--cache-control', entry.cacheControl, '--only-show-errors'];
  if (entry.contentEncoding) args.push('--content-encoding', entry.contentEncoding);
  await aws(args);
}
console.log(`published ${plan.length} objects`);

const listed = JSON.parse((await aws(['s3api', 'list-objects-v2', '--bucket', bucket, '--prefix', 'assets/', '--query', 'Contents[].Key', '--output', 'json'])).trim() || 'null') ?? [];
const stale = prunable(listed, plan);
for (const key of stale) await aws(['s3api', 'delete-object', '--bucket', bucket, '--key', key]);
console.log(`removed ${stale.length} unreferenced assets`);

await aws(['cloudfront', 'create-invalidation', '--distribution-id', distribution, '--paths', ...INVALIDATED, '--output', 'json']);
console.log(`invalidated ${INVALIDATED.length} paths`);
