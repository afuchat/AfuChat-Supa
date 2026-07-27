/**
 * ─── useQueryCache ─────────────────────────────────────────────────────────────
 *
 * React hook for the global SWR query cache.
 *
 * Usage:
 *   const { data, loading, refresh } = useQueryCache(
 *     "communities:groups",
 *     () => fetchGroups(),
 *     { ttlMs: 5 * 60 * 1000 }
 *   );
 *
 * - Renders immediately with cached data (from MMKV, survives restarts).
 * - Shows loading=true only when there is NO cached data at all.
 * - Automatically triggers a background refresh when data is stale.
 * - All subscribers to the same key share one network call.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  queryCacheFetch,
  queryCacheReadSync,
  queryCacheSubscribe,
  type QueryOptions,
} from "../storage/queryCache";

type UseQueryResult<T> = {
  data: T | null;
  loading: boolean;
  isStale: boolean;
  refresh: () => Promise<void>;
};

export function useQueryCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: QueryOptions & { enabled?: boolean } = {},
): UseQueryResult<T> {
  const { enabled = true, ...queryOpts } = options;

  // Sync read from MMKV on first render — no flash, no waterfall
  const [data, setData] = useState<T | null>(() => {
    const cached = queryCacheReadSync<T>(key);
    return cached?.data ?? null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    return queryCacheReadSync<T>(key) === null;
  });
  const [isStale, setIsStale] = useState(false);

  // Keep a stable ref to the fetcher so useEffect deps stay minimal
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const doFetch = useCallback(async () => {
    const result = await queryCacheFetch<T>(
      key,
      () => fetcherRef.current(),
      queryOpts,
    );
    if (result.data !== null) {
      setData(result.data);
      setIsStale(result.isStale);
    }
    setLoading(false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to cache updates from background refreshes / other components
  useEffect(() => {
    const unsub = queryCacheSubscribe(key, (fresh: T) => {
      setData(fresh);
      setIsStale(false);
      setLoading(false);
    });
    return unsub;
  }, [key]);

  // Initial fetch
  useEffect(() => {
    if (!enabled) return;
    doFetch();
  }, [key, enabled, doFetch]);

  return { data, loading, isStale, refresh: doFetch };
}
