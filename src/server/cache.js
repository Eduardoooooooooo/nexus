'use strict';

// LRU com limite de entradas/bytes e uma Ãºnica consulta por chave em andamento.
function createCache({
  maxEntries = 200,
  maxBytes = 16 * 1024 * 1024,
  maxPending = 64,
  now = Date.now,
  sizeOf = value => Buffer.byteLength(JSON.stringify(value) ?? '')
} = {}) {
  const entries = new Map();
  const pending = new Map();
  let bytes = 0;

  function remove(key) {
    const entry = entries.get(key);
    if (!entry) return;
    bytes -= entry.size;
    entries.delete(key);
  }

  function get(key) {
    const entry = entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= now()) {
      remove(key);
      return undefined;
    }
    entries.delete(key);
    entries.set(key, entry);
    return entry.value;
  }

  function set(key, value, ttl) {
    remove(key);
    const size = sizeOf(value);
    if (!(ttl > 0) || size > maxBytes || maxEntries < 1) return;
    for (const [otherKey, entry] of entries) {
      if (entry.expires <= now()) remove(otherKey);
    }
    while (entries.size >= maxEntries || bytes + size > maxBytes) {
      remove(entries.keys().next().value);
    }
    entries.set(key, { value, size, expires: now() + ttl });
    bytes += size;
  }

  function getOrLoad(key, loader, { ttl = 60000 } = {}) {
    const value = get(key);
    if (value !== undefined) return Promise.resolve(value);
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= maxPending) {
      return Promise.reject(Object.assign(new Error('Muitas consultas. Tente novamente em instantes.'), { status: 503 }));
    }
    const task = Promise.resolve().then(loader).then(result => {
      set(key, result, typeof ttl === 'function' ? ttl(result) : ttl);
      return result;
    }).finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }

  return { get, set, getOrLoad };
}

module.exports = { createCache };
