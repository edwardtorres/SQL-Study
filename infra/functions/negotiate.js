// CloudFront Function (viewer request). The build writes a brotli (.br) and a gzip (.gz) sibling beside every hashed asset of
// these types, and S3 serves each sibling with its Content-Encoding. This function chooses the sibling the viewer accepts.
// Clients that accept neither get the original, so no client is handed bytes it cannot read.
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (!/^\/assets\/[^/]+\.(js|css|wasm|data)$/.test(uri)) return request;
  var accept = request.headers['accept-encoding'] ? request.headers['accept-encoding'].value : '';
  if (/\bbr\b/.test(accept)) {
    request.uri = uri + '.br';
  } else if (/\bgzip\b/.test(accept)) {
    request.uri = uri + '.gz';
  }
  return request;
}
