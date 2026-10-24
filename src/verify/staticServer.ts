import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
};

/** Tiny static file server. `mounts` maps URL prefixes to directories (longest prefix wins). */
export async function serveStatic(mounts: [string, string][], port = 0): Promise<{ url: string; server: Server }> {
  const sorted = mounts.toSorted((a, b) => b[0].length - a[0].length);
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url || '/').split('?')[0]);
    for (const [prefix, dir] of sorted) {
      if (!path.startsWith(prefix)) continue;
      let file = join(dir, normalize(path.slice(prefix.length)).replace(/^(\.\.[/\\])+/, ''));
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      else if (!existsSync(file) && existsSync(file + '.html')) file += '.html';
      if (!existsSync(file)) continue;
      res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] || 'application/octet-stream' });
      createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const addr = server.address();
  const p = typeof addr === 'object' && addr ? addr.port : port;
  return { url: `http://127.0.0.1:${p}`, server };
}
