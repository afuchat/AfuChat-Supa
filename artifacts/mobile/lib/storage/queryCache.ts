/**
 * ─── Global SWR Query Cache ──────────────────────────────────────────────────
 *
 * Stale-While-Revalidate cache backed by MMKV (survives app restarts) and an
 * in-memory Map (zero I/O within a session).
 *
 * Rules:
 *  • Cache hit → return data instantly, then refresh in background if stale
 *  • Inflight dedup → one network call per key at a time, no matter how many
 *    components ask simultaneously
 *  • TTL is "stale after N ms" — data is shown even if stale, but a background
 *    refresh is triggered so the next render is fresh
 *  • Works offline — cached data is always returned even past TTL; the refresh
 *    attempt is simply skipped when offline
 */

import { storage } from "./mmkv";
import { isOnline } from "../offlineStore";

const MMKV_PREFIX = "qc:";

// In-memory hot cache: key → { data, fetchedAt }
const _mem = new Map<string, { data: any; fetchedAt: number }>();

// Inflight request dedup: key → Promise<any>
const _inflight = new Map<string, Promise<any>>();

// Subscribers notified when a key's data changes (used by useQueryCache)
type Subscriber = (data: any) => void;
const _subscribers = new Map<string, Set<Subscriber>>();

export function queryCacheSubscribe(key: string, fn: Subscriber): () => void {
  if (!_subscribers.has(key)) _subscribers.set(key, new Set());
  _subscribers.get(key)!.add(fn);
  return () => _subscribers.get(key)?.delete(fn);
}

function notify(key: string, data: any) {
  _subscribers.get(key)?.forEach((fn) => fn(data));
}

// ─── Read (sync — zero I/O) ───────────────────────────────────────────────────

export function queryCacheReadSync<T>(key: string): { data: T; fetchedAt: number } | null {
  // 1. In-memory hot cache
  const mem = _mem.get(key);
  if (mem) return mem as { data: T; fetchedAt: number };

  // 2. MMKV (persisted across restarts)
  try {
    const raw = storage.getString(MMKV_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw) as { data: T; fetchedAt: number };
      _mem.set(key, parsed); // promote to hot cache
      return parsed;
    }
  } catch {}

  return null;
}

// ─── Write ────────────────────────────────────────────────────────────────────

export function queryCacheWrite<T>(key: string, data: T): void {
  const entry = { data, fetchedAt: Date.now() };
  _mem.set(key, entry);
  try {
    storage.setString(MMKV_PREFIX + key, JSON.stringify(entry));
  } catch {}
  notify(key, data);
}

// ─── Invalidate ───────────────────────────────────────────────────────────────

export function queryCacheInvalidate(key: string): void {
  _mem.delete(key);
  try { storage.delete(MMKV_PREFIX + key); } catch {}
}

export function queryCacheInvalidatePrefix(prefix: string): void {
  for (const key of Array.from(_mem.keys())) {
    if (key.startsWith(prefix)) _mem.delete(key);
  }
  try {
    const allKeys = storage.getString("__qc_keys__");
    // We don't track all keys for prefix deletion via MMKV — in-mem is enough
    // for session-lifetime data. MMKV entries will expire via TTL on next read.
  } catch {}
}

// ─── Fetch with SWR semantics ─────────────────────────────────────────────────

export type QueryOptions = {
  /** How long until the cached data is considered stale (default 2 min) */
  ttlMs?: number;
  /** If true, skip network call entirely (offline use) */
  offlineOnly?: boolean;
};

/**
 * Fetch data with stale-while-revalidate semantics.
 *
 * - Returns cached data immediately (from memory or MMKV).
 * - If stale (or missing), kicks off a background refresh.
 * - Only one inflight request per key at a time.
 * - Notifies all subscribers when fresh data arrives.
 *
 * Returns: { data, isStale, isFresh }
 */
export async function queryCacheFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: QueryOptions = {},
): Promise<{ data: T | null; isStale: boolean; isFresh: boolean }> {
  const ttlMs = options.ttlMs ?? 2 * 60 * 1000;

  // 1. Read from cache (instant)
  const cached = queryCacheReadSync<T>(key);
  const isStale = !cached || Date.now() - cached.fetchedAt > ttlMs;

  // 2. If fresh, return immediately — no network
  if (cached && !isStale) {
    return { data: cached.data, isStale: false, isFresh: true };
  }

  // 3. If stale but we have data, return stale immediately AND refresh in bg
  if (cached && isStale) {
    if (isOnline() && !options.offlineOnly) {
      _backgroundRefresh(key, fetcher).catch(() => {});
    }
    return { data: cached.data, isStale: true, isFresh: false };
  }

  // 4. No cache at all — must fetch (blocking)
  if (!isOnline() || options.offlineOnly) {
    return { data: null, isStale: true, isFresh: false };
  }

  try {
    const data = await _fetchWithDedup(key, fetcher);
    return { data, isStale: false, isFresh: true };
  } catch {
    return { data: null, isStale: true, isFresh: false };
  }
}

/** Fire-and-forget background refresh (deduplicated) */
async function _backgroundRefresh<T>(key: string, fetcher: () => Promise<T>): Promise<void> {
  try {
    await _fetchWithDedup(key, fetcher);
  } catch {}
}

/** One inflight request per key. Concurrent callers share the same Promise. */
async function _fetchWithDedup<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = _inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = (async () => {
    try {
      const data = await fetcher();
      queryCacheWrite(key, data);
      return data;
    } finally {
      _inflight.delete(key);
    }
  })();

  _inflight.set(key, promise);
  return promise;
}
