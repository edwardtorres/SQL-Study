import { defineConfig } from 'vite';

// Production policy: no third-party origins; WASM compilation is explicit.
// Inline styles are temporarily allowed for the spike; revisit for CodeMirror.
const policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

export default defineConfig({
  build: { target: 'es2022' },
  preview: { headers: { 'Content-Security-Policy': policy } },
});
