type CacheEntry<T> = {
  data: T;
  timestamp: number;
  ttl: number;
  promise?: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

// Master / reference lookup data changes rarely: cache 60s
const MASTER_RESOURCES = [
  "customer",
  "technician",
  "brand",
  "unit-type",
  "paper-size",
  "paper-type",
  "uom",
  "product-categor",
  "supplier",
  "system-setting",
  "role",
  "permission",
  "module",
];

function getTTLForKey(key: string): number {
  const lower = key.toLowerCase();
  for (const res of MASTER_RESOURCES) {
    if (lower.includes(res)) return 60000; // 60s for master data
  }
  return 30000; // 30s default for operational data
}

const inflight = new Map<string, Promise<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const ttl = entry.ttl || getTTLForKey(key);
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCached<T>(key: string, data: T, ttl?: number): void {
  cache.set(key, {
    data,
    timestamp: Date.now(),
    ttl: ttl || getTTLForKey(key),
  });
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
      setCached(key, data);
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
  const clean = (pattern.split("?")[0] || "").replace(/^\/+|\/+$/g, "");
  const kebab = clean.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const segments = clean.split("/");
  const rootResource = segments[0] ? `/${segments[0]}` : "";
  const rootKebab = kebab.split("/")[0] ? `/${kebab.split("/")[0]}` : "";

  // Common aliases in resource mappings
  const aliases: string[] = [];
  if (clean.includes("sparepart") || kebab.includes("sparepart")) {
    aliases.push("service-spareparts", "sparepart-requests");
  }
  if (clean.includes("delivery") || kebab.includes("delivery")) {
    aliases.push("delivery-orders");
  }
  if (clean.includes("report") || kebab.includes("report")) {
    aliases.push("service-reports");
  }

  for (const key of cache.keys()) {
    if (
      key.includes(pattern) ||
      key.includes(kebab) ||
      (rootResource && key.includes(rootResource)) ||
      (rootKebab && key.includes(rootKebab)) ||
      aliases.some((alias) => key.includes(alias))
    ) {
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