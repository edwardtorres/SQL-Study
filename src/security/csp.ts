// The one Content-Security-Policy of the desk. vite.config.ts serves it in development and preview, and tests/csp.test.ts checks
// that the CloudFront response-headers policy in infra/sql-site.yaml carries the same string.
// WebAssembly needs 'wasm-unsafe-eval' in script-src. General 'unsafe-eval' is never allowed.
// style-src allows 'unsafe-inline' because CodeMirror injects its style elements; the SAA policy's style-src 'self' blocks them (e2e/csp.spec.ts).
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');
