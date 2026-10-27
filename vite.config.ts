import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
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
        if (!file.startsWith(`${output}${sep}`) || !(extname(file) in mime)) return next();
        if (!existsSync(file)) return next();
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

export default defineConfig({
  plugins: [react(), tailwindcss(), browserAssets()],
  worker: { format: 'es' },
  // Prebundle lazy worker dependencies before the first SQL screen; discovering
  // them on first use otherwise triggers a development-page reload.
  optimizeDeps: { include: ['@electric-sql/pglite', 'libpg-query'] },
  build: {
    target: 'es2022',
    rolldownOptions: { input: { main: resolve('index.html'), lab: resolve('engine-lab.html') } },
  },
  preview: { headers: { 'Content-Security-Policy': policy } },
});
