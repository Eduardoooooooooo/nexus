'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createCache } = require('./cache');

function createStaticAssets({ root } = {}) {
  const cache = createCache({
    maxEntries: 80,
    maxBytes: 32 * 1024 * 1024,
    sizeOf: asset => asset.content.length
  });

  return async function serve(request, response, relativePath, type) {
    // Os caminhos sÃ£o provenientes exclusivamente da lista de rotas do servidor.
    const file = path.join(root, relativePath);
    const stat = await fs.stat(file, { bigint: true });
    const key = [file, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':');
    const asset = await cache.getOrLoad(key, async () => {
      const content = await fs.readFile(file);
      return {
        content,
        etag: '"' + createHash('sha256').update(content).digest('hex') + '"'
      };
    }, { ttl: 5 * 60 * 1000 });
    const headers = {
      'Content-Type': type,
      'Cache-Control': type.startsWith('image/')
        ? 'public, max-age=300, must-revalidate'
        : 'public, no-cache',
      ETag: asset.etag
    };
    const matches = String(request.headers['if-none-match'] || '')
      .split(',').map(value => value.trim().replace(/^W\//, ''));
    if (matches.includes('*') || matches.includes(asset.etag)) {
      response.writeHead(304, headers);
      response.end();
      return;
    }
    response.writeHead(200, { ...headers, 'Content-Length': asset.content.length });
    response.end(request.method === 'HEAD' ? undefined : asset.content);
  };
}

module.exports = { createStaticAssets };
