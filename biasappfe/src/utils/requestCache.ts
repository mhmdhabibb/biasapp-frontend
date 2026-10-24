type CacheEntry<T> = {
  data: T;
  timestamp: number;
  promise?: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL = 300000; // 5 minutes for master data; use getOrFetch useCache=false for live data
const inflight = new Map<string, Promise<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  useCache = true,
): Promise<T> {
  if (useCache) {
    const cached = getCached<T>(key);
    if (cached) return Promise.resolve(cached);
  }

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher()
    .then((data) => {
      if (useCache) setCached(key, data);
      inflight.delete(key);
      return data;
    })
    .catch((err) => {
      inflight.delete(key);
      throw err;
    });

  inflight.set(key, promise);
  return promise;
}

export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    cache.clear();
    return;
  }
  const clean = pattern.split("?")[0].replace(/^\/+|\/+$/g, "");
  const segments = clean.split("/");
  const rootResource = segments[0] ? `/${segments[0]}` : "";

  for (const key of cache.keys()) {
    if (key.includes(pattern) || (rootResource && key.includes(rootResource))) {
      cache.delete(key);
    }
  }
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
): T {
  let timeoutId: ReturnType<typeof setTimeout>;
  return ((...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}