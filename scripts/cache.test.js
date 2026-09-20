'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createCache } = require('../src/server/cache');
const { createStaticAssets } = require('../src/server/static-assets');
const { createMangaDex } = require('../src/server/mangadex');
const { createJikan } = require('../src/server/jikan');
const { createKomga } = require('../src/server/komga');
const { createServer } = require('../server');

const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const ID = '11111111-1111-4111-8111-111111111111';
const series = {
  id: ID, attributes: { title: { en: 'Example' }, contentRating: 'safe' },
  relationships: [{ type: 'cover_art', attributes: { fileName: 'cover.jpg' } }]
};

async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return 'http://127.0.0.1:' + server.address().port;
}

test('cache deduplicates concurrent requests and expires from completion', async () => {
  let now = 0, calls = 0, release;
  const cache = createCache({ now: () => now });
  const loader = () => { calls++; return new Promise(resolve => { release = resolve; }); };
  const first = cache.getOrLoad('a', loader, { ttl: 10 });
  await Promise.resolve();
  now = 20;
  const second = cache.getOrLoad('a', loader, { ttl: 10 });
  release('value');
  assert.deepEqual(await Promise.all([first, second]), ['value', 'value']);
  assert.equal(calls, 1);
  now = 29;
  assert.equal(cache.get('a'), 'value');
  now = 30;
  assert.equal(cache.get('a'), undefined);
  assert.equal(await cache.getOrLoad('a', () => 'updated'), 'updated');
});

test('cache evicts by LRU and bytes, skips oversized entries and retries failures', async () => {
  const cache = createCache({ maxEntries: 2, maxBytes: 4, sizeOf: value => value.length });
  cache.set('a', 'aa', 1000);
  cache.set('b', 'bb', 1000);
  cache.get('a');
  cache.set('c', 'cc', 1000);
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), 'aa');
  cache.set('large', '12345', 1000);
  assert.equal(cache.get('large'), undefined);
  await assert.rejects(cache.getOrLoad('failed', () => { throw new Error('offline'); }), /offline/);
  assert.equal(await cache.getOrLoad('failed', () => 'ok'), 'ok');
});

test('cache limits pending work without rejecting a duplicate request', async () => {
  const cache = createCache({ maxPending: 1 });
  let release;
  const first = cache.getOrLoad('a', () => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  const duplicate = cache.getOrLoad('a', () => 'unexpected');
  await assert.rejects(cache.getOrLoad('b', () => 'b'), { status: 503 });
  release('done');
  assert.equal(await first, await duplicate);
  assert.equal(await cache.getOrLoad('b', () => 'b'), 'b');
});

test('static cache returns 304, handles HEAD and detects file edits', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nexus-cache-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'test.css'), 'body { color: red; }');
  const serve = createStaticAssets({ root });
  const base = await listen(t, http.createServer((req, res) => {
    serve(req, res, 'test.css', 'text/css').catch(error => { res.writeHead(500); res.end(error.message); });
  }));
  const first = await fetch(base);
  const etag = first.headers.get('etag');
  assert.equal(first.headers.get('cache-control'), 'public, no-cache');
  assert.equal(await first.text(), 'body { color: red; }');
  const cached = await fetch(base, { headers: { 'if-none-match': 'W/' + etag } });
  assert.equal(cached.status, 304);
  assert.equal(await cached.text(), '');
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.headers.get('etag'), etag);
  assert.equal(await head.text(), '');
  await fs.writeFile(path.join(root, 'test.css'), 'body { color: purple; }');
  const changed = await fetch(base, { headers: { 'if-none-match': etag } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get('etag'), etag);
  assert.match(await changed.text(), /purple/);
});

test('MangaDex reuses catalog metadata and coalesces repeated cover downloads', async () => {
  let jsonCalls = 0, imageCalls = 0;
  const service = createMangaDex({ fetchImpl: async url => {
    if (url.startsWith('https://uploads.')) {
      imageCalls++;
      return new Response(Buffer.from([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
    }
    jsonCalls++;
    return json({ total: 1, data: [series] });
  } });
  await service.listSeries();
  assert.equal((await service.getSeries(ID)).title, 'Example');
  const images = await Promise.all(Array.from({ length: 8 }, () => service.cover(ID)));
  assert.equal(images[0].buffer.length, 3);
  await service.cover(ID);
  assert.equal(jsonCalls, 1);
  assert.equal(imageCalls, 1);
});

test('Jikan deduplicates queries, caches misses briefly and refreshes after expiry', async () => {
  let calls = 0, now = 0;
  const jikan = createJikan({ now: () => now, fetchImpl: async () => { calls++; return json({ data: [] }); } });
  assert.deepEqual(await Promise.all([jikan.lookup('Example'), jikan.lookup('example')]), [null, null]);
  await jikan.lookup('Example');
  assert.equal(calls, 1);
  now = 30000;
  await jikan.lookup('Example');
  assert.equal(calls, 2);
});

test('Komga caches metadata and images and refreshes expired metadata', async () => {
  let calls = 0, now = 0;
  const komga = createKomga({
    now: () => now,
    env: { KOMGA_URL: 'http://localhost:25600', KOMGA_USERNAME: 'test', KOMGA_PASSWORD: 'test' },
    fetchImpl: async url => {
      calls++;
      return url.endsWith('/thumbnail')
        ? new Response('image', { headers: { 'content-type': 'image/jpeg' } })
        : json({ id: 'one', metadata: { title: 'Example' } });
    }
  });
  await Promise.all([komga.getSeries('one'), komga.getSeries('one')]);
  await Promise.all([komga.image('/api/v1/series/one/thumbnail'), komga.image('/api/v1/series/one/thumbnail')]);
  assert.equal(calls, 2);
  now = 60000;
  await komga.getSeries('one');
  assert.equal(calls, 3);
});

test('warm provider cache still requires authentication and private data remains no-store', async t => {
  const server = createServer({
    databasePath: ':memory:',
    databaseOptions: { env: { NEXUS_ADMIN_PASSWORD: 'cache-test' }, logger: { warn() {} } },
    mangadexOptions: { fetchImpl: async url => url.startsWith('https://uploads.')
      ? new Response('image', { headers: { 'content-type': 'image/jpeg' } })
      : json({ total: 1, data: [series] }) }
  });
  const base = await listen(t, server);
  const login = await fetch(base + '/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'cache-test' })
  });
  assert.equal(login.status, 200);
  const headers = { cookie: login.headers.get('set-cookie').split(';')[0] };
  const catalog = await fetch(base + '/api/mangadex/series', { headers });
  assert.equal(catalog.status, 200);
  assert.equal(catalog.headers.get('cache-control'), 'no-store');
  const imagePath = '/api/mangadex/series/' + ID + '/thumbnail';
  assert.equal((await fetch(base + imagePath, { headers })).status, 200);
  assert.equal((await fetch(base + imagePath)).status, 401);
  assert.equal((await fetch(base + '/api/mangadex/series')).status, 401);
  const profile = await fetch(base + '/api/account/profile', { headers });
  assert.equal(profile.headers.get('cache-control'), 'no-store');
  await fetch(base + '/api/logout', { method: 'POST', headers });
  assert.equal((await fetch(base + imagePath, { headers })).status, 401);
  const asset = await fetch(base + '/main.js');
  const cached = await fetch(base + '/main.js', { headers: { 'if-none-match': asset.headers.get('etag') } });
  assert.equal(cached.status, 304);
});

test('MangaDex cache separates filters and does not extend detail TTL on catalog hits', async () => {
  let now = 0;
  const urls = [];
  const service = createMangaDex({ now: () => now, fetchImpl: async url => {
    urls.push(url);
    const isDetail = new URL(url).pathname === '/manga/' + ID;
    return json(isDetail ? { data: series } : { total: 1, data: [series] });
  } });
  await service.listSeries({ lang: 'pt-br' });
  await service.listSeries({ lang: 'en' });
  await service.listSeries({ lang: 'pt-br', ratings: ['safe'] });
  assert.equal(urls.length, 3);
  now = 299999;
  await service.listSeries({ lang: 'pt-br' });
  assert.equal(urls.length, 3);
  now = 300000;
  await service.getSeries(ID);
  assert.equal(urls.length, 4);
  assert.equal(new URL(urls[3]).pathname, '/manga/' + ID);
});
