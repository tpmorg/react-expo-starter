// Serve an existing Expo web export locally; this script does not build it.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync(path.resolve(process.argv[2] || 'dist'));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = http.createServer((request, response) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405).end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) { response.writeHead(403).end(); return; }
    if (!path.extname(file)) file = path.join(root, 'index.html');
    file = fs.realpathSync(file);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.writeHead(200);
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch { response.writeHead(404).end(); }
});
server.listen(Number(process.env.PORT || 8080), '127.0.0.1', () => console.log(`Web preview at http://127.0.0.1:${server.address().port}`));
