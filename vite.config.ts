import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// WASM compilation is explicit; the app never enables general unsafe-eval.
const policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const mime: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.data': 'application/octet-stream',
  '.json': 'application/json',
};

function encoding(header: string | undefined): 'br' | 'gzip' | undefined {
  const accepted = new Map((header ?? '').split(',').map((entry) => {
    const [name, ...params] = entry.trim().toLowerCase().split(';');
    const quality = params.find((param) => param.trim().startsWith('q='));
    return [name, quality ? Number(quality.trim().slice(2)) : 1] as const;
  }));
  const br = accepted.get('br') ?? 0;
  const gzip = accepted.get('gzip') ?? 0;
  if (br > 0 && br >= gzip) return 'br';
  return gzip > 0 ? 'gzip' : undefined;
}

function browserAssets(): Plugin {
  const parserWasm = resolve('node_modules/libpg-query/wasm/libpg-query.wasm');
  const output = resolve('dist');
  return {
    name: 'same-origin-compressed-browser-assets',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'assets/libpg-query.wasm', source: readFileSync(parserWasm) });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (!pathname.endsWith('/libpg-query.wasm')) return next();
        response.setHeader('Content-Type', 'application/wasm');
        response.end(readFileSync(parserWasm));
      });
    },
    async closeBundle() {
      if (!existsSync(output)) return;
      async function compress(directory: string): Promise<void> {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const file = resolve(directory, entry.name);
          if (entry.isDirectory()) {
            await compress(file);
          } else if (extname(file) in mime) {
            const bytes = await readFile(file);
            await Promise.all([
              writeFile(`${file}.gz`, gzipSync(bytes, { level: 9 })),
              writeFile(`${file}.br`, brotliCompressSync(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } })),
            ]);
          }
        }
      }
      await mkdir(output, { recursive: true });
      await compress(output);
    },
    configurePreviewServer(server) {
      // Serve precompressed bytes before Vite's static middleware. Both WASM
      // and the filesystem data package receive real HTTP Content-Encoding.
      server.middlewares.use((request, response, next) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') return next();
        const selected = encoding(request.headers['accept-encoding']);
        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
        } catch {
          response.statusCode = 400;
          return response.end('Malformed URL');
        }
        const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
        const file = resolve(output, relative);
        if (!file.startsWith(`${output}${sep}`)) return next();
        // Documents and the files the desk loads are served here. A missing one gets the 404 page with status 404, so an unknown
        // address never falls back to the office page with a 200.
        const kind = extname(file);
        if (kind !== '' && !(kind in mime)) return next();
        if (!existsSync(file) || statSync(file).isDirectory()) {
          response.statusCode = 404;
          response.setHeader('Content-Type', mime['.html']!);
          response.setHeader('Content-Security-Policy', policy);
          response.setHeader('Cache-Control', 'no-cache');
          return response.end(readFileSync(resolve(output, '404.html')));
        }
        const compressed = selected ? `${file}.${selected === 'gzip' ? 'gz' : 'br'}` : undefined;
        const body = compressed && existsSync(compressed) ? compressed : file;
        response.setHeader('Content-Type', mime[extname(file)]!);
        if (body === compressed && selected) response.setHeader('Content-Encoding', selected);
        response.setHeader('Vary', 'Accept-Encoding');
        response.setHeader('Content-Security-Policy', policy);
        response.setHeader('Cache-Control', 'no-cache');
        response.setHeader('Content-Length', statSync(body).size);
        if (request.method === 'HEAD') return response.end();
        createReadStream(body).pipe(response);
      });
    },
  };
}

// Routes the offline worker precaches besides the built entry, its CSS and the icons. Lazy chunks and the engine are not listed.
const SHELL_ROUTES = ['/', '/index.html', '/manifest.webmanifest'];

// Writes dist/sw.js from scripts/pwa/sw.template.js. The shell is the entry chunk and its static imports, its CSS, and the
// public icons. The build id is a hash of the shell list and the template, so any change to either starts a new cache.
function serviceWorker(): Plugin {
  const template = readFileSync(resolve('scripts/pwa/sw.template.js'), 'utf8');
  return {
    name: 'offline-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.values(bundle);
      const chunks = new Map(files.flatMap((file) => (file.type === 'chunk' ? [[file.fileName, file] as const] : [])));
      const entry = files.find((file) => file.type === 'chunk' && file.isEntry && file.name === 'main');
      if (!entry) throw new Error('The service worker needs the main entry chunk');
      const shell = new Set<string>(SHELL_ROUTES);
      const visit = (fileName: string): void => {
        if (shell.has(`/${fileName}`)) return;
        shell.add(`/${fileName}`);
        for (const imported of chunks.get(fileName)?.imports ?? []) visit(imported);
      };
      visit(entry.fileName);
      for (const file of files) if (file.type === 'asset' && file.fileName.endsWith('.css')) shell.add(`/${file.fileName}`);
      for (const icon of readdirSync('public/icons')) shell.add(`/icons/${icon}`);
      const list = [...shell].sort();
      const buildId = createHash('sha256').update(template).update(JSON.stringify(list)).digest('hex').slice(0, 12);
      const source = template.replace("'__BUILD_ID__'", `'${buildId}'`).replace('__SHELL__', JSON.stringify(list));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), browserAssets(), serviceWorker()],
  worker: { format: 'es' },
  // Prebundle lazy worker dependencies before the first SQL screen; discovering
  // them on first use otherwise triggers a development-page reload.
  optimizeDeps: { include: ['@electric-sql/pglite', 'libpg-query'] },
  build: {
    target: 'es2022',
    // The engine lab is a development and test page. The shipped build leaves it out unless ENGINE_LAB=1 (the test and spike scripts set it).
    rolldownOptions: { input: { main: resolve('index.html'), ...(process.env.ENGINE_LAB === '1' ? { lab: resolve('engine-lab.html') } : {}) } },
  },
  preview: { headers: { 'Content-Security-Policy': policy } },
});
