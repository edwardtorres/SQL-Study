import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { CONTENT_SECURITY_POLICY } from '../src/security/csp';

// The AWS templates are checked against the app, so the two cannot drift apart. cfn-lint checks their syntax in the deploy workflow.
const site = readFileSync('infra/sql-site.yaml', 'utf8');
const cert = readFileSync('infra/sql-cert.yaml', 'utf8');
// The source file opens with a comment that stays out of the template; the code after it is what the template embeds.
const negotiateSource = readFileSync('infra/functions/negotiate.js', 'utf8').split('\n').filter((line) => !line.startsWith('//')).join('\n').trim();

// The function's text as embedded in the template: the lines after `FunctionCode: |`, with their common indentation removed.
function embeddedFunction(template: string): string {
  const lines = template.split('\n');
  const start = lines.findIndex((line) => line.trimStart() === 'FunctionCode: |');
  expect(start, 'FunctionCode block').toBeGreaterThan(-1);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== '' && !line.startsWith('        ')) break;
    body.push(line.slice(8));
  }
  return body.join('\n').trimEnd();
}

describe('the content security policy', () => {
  test('the response-headers policy carries the same string the app serves', () => {
    const declared = site.match(/ContentSecurityPolicy: "([^"]+)"/)?.[1];
    expect(declared).toBe(CONTENT_SECURITY_POLICY);
  });

  test('the policy allows WebAssembly and never general eval', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/unsafe-eval(?!')/);
    expect(CONTENT_SECURITY_POLICY).not.toMatch(/'unsafe-eval'/);
  });
});

describe('the CloudFront Function', () => {
  test('the template embeds the same function as infra/functions/negotiate.js', () => {
    expect(embeddedFunction(site)).toBe(negotiateSource);
  });

  // Run the source as the function runs it: one handler taking an event.
  const handler = new Function(`${negotiateSource}\nreturn handler;`)() as (event: { request: { uri: string; headers: Record<string, { value: string }> } }) => { uri: string };
  const request = (uri: string, acceptEncoding?: string) => ({
    uri, headers: acceptEncoding === undefined ? {} : { 'accept-encoding': { value: acceptEncoding } },
  });

  test('a viewer that accepts brotli gets the .br sibling of a hashed asset', () => {
    expect(handler({ request: request('/assets/pglite-C2k-M10h.wasm', 'gzip, deflate, br, zstd') }).uri).toBe('/assets/pglite-C2k-M10h.wasm.br');
  });

  test('a viewer that accepts only gzip gets the .gz sibling', () => {
    expect(handler({ request: request('/assets/main-wZvSOKsL.js', 'gzip, deflate') }).uri).toBe('/assets/main-wZvSOKsL.js.gz');
  });

  test('a viewer that accepts neither gets the original', () => {
    expect(handler({ request: request('/assets/pglite-k6Y9avCD.data', 'identity') }).uri).toBe('/assets/pglite-k6Y9avCD.data');
    expect(handler({ request: request('/assets/main-wZvSOKsL.js') }).uri).toBe('/assets/main-wZvSOKsL.js');
  });

  test('pages, the worker and the manifest are never rewritten', () => {
    for (const uri of ['/', '/index.html', '/sw.js', '/manifest.webmanifest', '/icons/icon-192.png', '/assets/main.js.br']) {
      expect(handler({ request: request(uri, 'br, gzip') }).uri).toBe(uri);
    }
  });
});

describe('the bucket and the deploy role', () => {
  test('every public access setting is on, and the bucket is private to this distribution', () => {
    for (const setting of ['BlockPublicAcls', 'BlockPublicPolicy', 'IgnorePublicAcls', 'RestrictPublicBuckets']) {
      expect(site).toMatch(new RegExp(`${setting}: true`));
    }
    expect(site).toContain('cloudfront.amazonaws.com');
    expect(site).toContain('AWS:SourceArn');
    expect(site).toContain("aws:SecureTransport: 'false'");
  });

  test('the deploy role trusts only the main branch of this repository, with OIDC audience', () => {
    expect(site).toContain("token.actions.githubusercontent.com:sub: !Sub 'repo:${GitHubRepository}:ref:refs/heads/main'");
    expect(site).toContain('token.actions.githubusercontent.com:aud: sts.amazonaws.com');
    expect(site).toContain('GitHubRepository');
    expect(site).toMatch(/Default: edwardtorres\/SQL-Study/);
  });

  test('the deploy role can list and write the bucket and invalidate this distribution, and nothing more', () => {
    const role = site.slice(site.indexOf('  DeployRole:'), site.indexOf('  ProjectBudget:'));
    const actions = [...new Set(role.match(/(?:s3|cloudfront):[A-Za-z]+/g))].sort();
    expect(actions).toEqual(['cloudfront:CreateInvalidation', 's3:DeleteObject', 's3:ListBucket', 's3:PutObject']);
    expect(role).not.toMatch(/Action: \*|"\*"|Resource: '\*'/);
  });

  test('the budget covers the sql-study tag and alerts the owner', () => {
    expect(site).toContain("'user:Project$sql-study'");
    expect(site).toContain('Threshold: 80');
    expect(site).toContain('Threshold: 100');
  });

  test('the certificate is requested in DNS validation for the site host', () => {
    expect(cert).toContain('ValidationMethod: DNS');
    expect(cert).toContain('Default: sql.edwardtorres.dev');
  });
});
