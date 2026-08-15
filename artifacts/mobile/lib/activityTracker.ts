/**
 * Activity Tracker
 *
 * Fire-and-forget event recording for personalization.
 * - Stores events locally in a ring buffer (AsyncStorage, max 1000, 30-day TTL)
 * - Batches sync to Supabase `user_activity_events` table every 20 events or 5 min
 * - Never blocks the caller — all writes are async and swallow errors
 * - Deduplicates rapid repeat views of the same content (30-second window)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { isOnline } from "./offlineStore";

const RING_KEY       = "afu:activity:ring_v1";
const MAX_EVENTS     = 1000;
const MAX_AGE_MS     = 30 * 24 * 60 * 60 * 1000; // 30 days
const DEDUP_WINDOW   = 30_000;                     // 30 seconds
const SYNC_BATCH     = 20;
const SYNC_INTERVAL  = 5 * 60 * 1000;             // 5 minutes

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityEventType =
  | "search"         // { query, tab?, results_count? }
  | "view_post"      // { post_id, author_id, post_type? }
  | "view_video"     // { post_id, author_id, watch_ratio? }
  | "view_profile"   // { profile_id }
  | "like_post"      // { post_id, author_id, content_preview? }
  | "comment_post"   // { post_id, author_id }
  | "share_post"     // { post_id, author_id }
  | "follow_user"    // { profile_id }
  | "bookmark_post"  // { post_id, author_id }
  | "tab_visit"      // { tab }
  | "feature_use";   // { feature }

export type StoredEvent = {
  id:      string;
  type:    ActivityEventType;
  data:    Record<string, unknown>;
  ts:      number;
  synced:  boolean;
  userId?: string;
};

// ─── Module state ─────────────────────────────────────────────────────────────

let _userId: string | null             = null;
let _syncTimer: ReturnType<typeof setTimeout> | null = null;
let _pendingCount                      = 0;
let _ringCache: StoredEvent[] | null   = null;
let _ringLoad: Promise<StoredEvent[]> | null = null;
let _appendQueue: Promise<void>         = Promise.resolve();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Call once when auth state changes (user login / logout).
 * Pass `null` to disable tracking after logout.
 */
export function initActivityTracker(userId: string | null): void {
  _userId = userId;
  if (_syncTimer) { clearTimeout(_syncTimer); _syncTimer = null; }
  if (userId) _scheduleSyncLoop();
}

/**
 * Track an activity event. Non-blocking — never throws.
 * Safe to call from any render cycle or event handler.
 */
export function trackEvent(
  type: ActivityEventType,
  data: Record<string, unknown> = {},
): void {
  if (!_userId) return;
  const uid = _userId;
  _appendEvent({ type, data, userId: uid }).then(() => {
    _pendingCount++;
    if (_pendingCount >= SYNC_BATCH) {
      _pendingCount = 0;
      _syncToSupabase().catch(() => {});
    }
  }).catch(() => {});
}

/**
 * Read recent events from the local ring buffer.
 * Returns events sorted newest-first.
 */
export async function getRecentEvents(
  type?: ActivityEventType,
  limit = 200,
): Promise<StoredEvent[]> {
  try {
    const ring = await _loadRing();
    const cutoff = Date.now() - MAX_AGE_MS;
    return ring
      .filter((e) => e.ts > cutoff && (!type || e.type === type))
      .slice(-limit)
      .reverse();
  } catch { return []; }
}

/**
 * Force-flush unsynced events to Supabase (e.g. on app background).
 */
export async function flushActivitySync(): Promise<void> {
  await _syncToSupabase().catch(() => {});
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _appendEvent(
  ev: Omit<StoredEvent, "id" | "ts" | "synced">,
): Promise<void> {
  const write = _appendQueue.then(async () => {
    let ring = await _loadRing();

    const now    = Date.now();
    const cutoff = now - MAX_AGE_MS;

    // Prune expired
    ring = ring.filter((e) => e.ts > cutoff);

    // Deduplicate rapid view events
    if (ev.type === "view_video" || ev.type === "view_post") {
      const recentWindow = now - DEDUP_WINDOW;
      if (ring.some((e) =>
        e.type === ev.type &&
        (e.data.post_id as string) === (ev.data.post_id as string) &&
        e.ts > recentWindow,
      )) return;
    }

    ring.push({
      id:     `${now}_${Math.random().toString(36).slice(2, 7)}`,
      ts:     now,
      synced: false,
      ...ev,
    });

    if (ring.length > MAX_EVENTS) ring = ring.slice(-MAX_EVENTS);

    _ringCache = ring;
    await AsyncStorage.setItem(RING_KEY, JSON.stringify(ring));
  });
  _appendQueue = write.catch(() => {});
  await write.catch(() => {});
}

async function _loadRing(): Promise<StoredEvent[]> {
  if (_ringCache) return _ringCache;
  if (_ringLoad) return _ringLoad;
  _ringLoad = AsyncStorage.getItem(RING_KEY)
    .then((raw) => {
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        _ringCache = Array.isArray(parsed) ? parsed : [];
      } catch {
        _ringCache = [];
      }
      return _ringCache;
    })
    .catch(() => {
      _ringCache = [];
      return _ringCache;
    })
    .finally(() => { _ringLoad = null; });
  return _ringLoad;
}

async function _syncToSupabase(): Promise<void> {
  if (!_userId || !isOnline()) return;
  try {
    let ring = await _loadRing();
    const uid      = _userId;
    const unsynced = ring.filter((e) => !e.synced && e.userId === uid).slice(0, SYNC_BATCH);
    if (unsynced.length === 0) return;

    const rows = unsynced.map((e) => ({
      user_id:    e.userId!,
      event_type: e.type,
      event_data: e.data,
      created_at: new Date(e.ts).toISOString(),
    }));

    const { error } = await supabase.from("user_activity_events").insert(rows);
    if (!error) {
      const syncedIds = new Set(unsynced.map((e) => e.id));
      ring = ring.map((e) => syncedIds.has(e.id) ? { ...e, synced: true } : e);
      _ringCache = ring;
      await AsyncStorage.setItem(RING_KEY, JSON.stringify(ring));
    }
  } catch {}
}

function _scheduleSyncLoop(): void {
  if (_syncTimer) return;
  _syncTimer = setTimeout(async () => {
    _syncTimer = null;
    await _syncToSupabase().catch(() => {});
    if (_userId) _scheduleSyncLoop();
  }, SYNC_INTERVAL);
}
