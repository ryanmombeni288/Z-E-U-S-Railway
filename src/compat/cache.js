function maxAgeSeconds(response) {
  const cacheControl = response?.headers?.get("cache-control") || "";
  const match = cacheControl.match(/(?:^|,)\s*max-age=(\d+)/i);
  return match ? Number(match[1]) : 0;
}

export class TtlCache {
  constructor({ maxEntries = 4096 } = {}) {
    this.maxEntries = maxEntries;
    this.entries = new Map();
  }

  key(request) {
    return typeof request === "string" ? request : request.url;
  }

  async match(request) {
    const key = this.key(request);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.response.clone();
  }

  async put(request, response) {
    const ttl = maxAgeSeconds(response);
    if (ttl <= 0) return;
    const key = this.key(request);
    this.entries.delete(key);
    this.entries.set(key, { response: response.clone(), expiresAt: Date.now() + ttl * 1000 });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }

  clear() {
    this.entries.clear();
  }
}

export function installCacheCompat() {
  if (!globalThis.caches?.default) {
    globalThis.caches = { default: new TtlCache() };
  }
  return globalThis.caches.default;
}
