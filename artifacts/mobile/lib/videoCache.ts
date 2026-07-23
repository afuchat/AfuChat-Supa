import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDB } from "./storage/db";
import { isCellular } from "./networkQuality";

// ─── Permanent Video Store ──────────────────────────────────────────────────────
// Videos are stored in documentDirectory once watched — permanently.
// The OS never auto-clears documentDirectory (unlike cacheDirectory).
// Data is only removed when the user explicitly clears storage, or uninstalls.
//
// RULES:
//   • No TTL — watched videos stay forever
//   • No auto-prune — grows until user clears it
//   • getCachedVideoUri() returns local path instantly if already on device
//   • markVideoWatched() is idempotent — calling it twice does nothing extra
//
// documentDirectory:
//   Android → /data/data/<pkg>/files/
//   iOS     → <app>/Documents/

// ─── Directories ───────────────────────────────────────────────────────────────

// Permanent watched-video store — survives cache pressure, lives until user deletes.
// FileSystem.documentDirectory is always a non-null string on Android.
const VIDEO_DIR = (FileSystem.documentDirectory ?? "") + "afuchat_videos/";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type OfflineVideoEntry = {
  postId: string;
  url: string;
  fileUri: string;
  fileSize: number;
  cachedAt: number;    // first-download timestamp (stored_at)
  watchedAt?: number;  // last time user watched this video
  title: string;
  thumbnail: string | null;
  // Author info (saved since db v13) — may be undefined for old entries
  authorId?: string;
  authorHandle?: string;
  authorName?: string;
  authorAvatar?: string | null;
};

// ─── In-memory maps ────────────────────────────────────────────────────────────

const memoryMap = new Map<string, string>();      // url → local path
const inProgress = new Map<string, Promise<string | null>>();
const saveInProgress = new Set<string>();

// ─── Helpers ───────────────────────────────────────────────────────────────────

function urlToFilename(url: string): string {
  let h = 5381;
  for (let i = 0; i < url.length; i++) {
    h = ((h << 5) + h) ^ url.charCodeAt(i);
    h = h >>> 0;
  }
  const raw = url.split("?")[0].split(".").pop()?.toLowerCase() ?? "mp4";
  const ext = ["mp4", "mov", "webm", "m4v", "mkv"].includes(raw) ? raw : "mp4";
  return `v_${h.toString(16)}.${ext}`;
}

async function ensureDir(dir: string) {
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  } catch {}
}

// ─── SQLite registry ───────────────────────────────────────────────────────────

async function dbGetEntry(postId: string): Promise<OfflineVideoEntry | null> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<any>(
      "SELECT * FROM video_registry WHERE post_id = ?",
      [postId],
    );
    if (!row) return null;
    return {
      postId: row.post_id,
      url: row.url,
      fileUri: row.file_uri,
      fileSize: row.file_size,
      cachedAt: row.stored_at,
      title: row.title ?? "",
      thumbnail: row.thumbnail ?? null,
      authorId: row.author_id ?? undefined,
      authorHandle: row.author_handle ?? undefined,
      authorName: row.author_name ?? undefined,
      authorAvatar: row.author_avatar ?? undefined,
    };
  } catch {
    return null;
  }
}

function rowToEntry(row: any): OfflineVideoEntry {
  return {
    postId: row.post_id,
    url: row.url,
    fileUri: row.file_uri,
    fileSize: row.file_size,
    cachedAt: row.stored_at,
    watchedAt: row.watched_at ?? row.stored_at,
    title: row.title ?? "",
    thumbnail: row.thumbnail ?? null,
    authorId: row.author_id ?? undefined,
    authorHandle: row.author_handle ?? undefined,
    authorName: row.author_name ?? undefined,
    authorAvatar: row.author_avatar ?? undefined,
  };
}

async function dbGetAll(): Promise<OfflineVideoEntry[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM video_registry ORDER BY COALESCE(watched_at, stored_at) DESC",
    );
    return rows.map(rowToEntry);
  } catch {
    return [];
  }
}

async function dbGetRecent(sinceMs: number): Promise<OfflineVideoEntry[]> {
  try {
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM video_registry WHERE COALESCE(watched_at, stored_at) >= ? ORDER BY COALESCE(watched_at, stored_at) DESC",
      [sinceMs],
    );
    return rows.map(rowToEntry);
  } catch {
    return [];
  }
}

async function dbSaveEntry(entry: OfflineVideoEntry): Promise<void> {
  try {
    const db = await getDB();
    const now = Date.now();
    await db.runAsync(
      `INSERT INTO video_registry
         (post_id, url, file_uri, file_size, title, thumbnail, stored_at, watched_at,
          author_id, author_handle, author_name, author_avatar)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(post_id) DO UPDATE SET
         url          = excluded.url,
         file_uri     = excluded.file_uri,
         file_size    = excluded.file_size,
         title        = excluded.title,
         thumbnail    = excluded.thumbnail,
         watched_at   = ?,
         author_id    = COALESCE(excluded.author_id, author_id),
         author_handle= COALESCE(excluded.author_handle, author_handle),
         author_name  = COALESCE(excluded.author_name, author_name),
         author_avatar= COALESCE(excluded.author_avatar, author_avatar)`,
      [
        entry.postId, entry.url, entry.fileUri, entry.fileSize,
        entry.title, entry.thumbnail, now, now,
        entry.authorId ?? null, entry.authorHandle ?? null,
        entry.authorName ?? null, entry.authorAvatar ?? null,
        now, // ON CONFLICT watched_at = ?
      ],
    );
  } catch {
    // Fallback: simple upsert without ON CONFLICT syntax (older SQLite)
    try {
      const db2 = await getDB();
      await db2.runAsync(
        `INSERT OR REPLACE INTO video_registry
           (post_id, url, file_uri, file_size, title, thumbnail, stored_at, watched_at,
            author_id, author_handle, author_name, author_avatar)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.postId, entry.url, entry.fileUri, entry.fileSize,
          entry.title, entry.thumbnail, entry.cachedAt || Date.now(), Date.now(),
          entry.authorId ?? null, entry.authorHandle ?? null,
          entry.authorName ?? null, entry.authorAvatar ?? null,
        ],
      );
    } catch {}
  }
}

async function dbDeleteEntry(postId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM video_registry WHERE post_id = ?", [postId]);
  } catch {}
}

async function dbDeleteAll(): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM video_registry");
  } catch {}
}

// ─── Playback: get local path or null ──────────────────────────────────────────

/**
 * Returns the local file path for a video URL if it's already on device.
 * Zero network — looks in memory map first, then the video directory.
 * Returns null if the video hasn't been downloaded yet.
 */
export async function getCachedVideoUri(url: string): Promise<string | null> {
  if (!url) return null;

  // 1. Memory map
  if (memoryMap.has(url)) return memoryMap.get(url)!;

  // 2. Check the permanent video directory
  try {
    await ensureDir(VIDEO_DIR);
    const localPath = VIDEO_DIR + urlToFilename(url);
    const info = await FileSystem.getInfoAsync(localPath);
    if (info.exists && (info as any).size > 0) {
      memoryMap.set(url, localPath);
      return localPath;
    }
  } catch {}

  return null;
}

/**
 * Pre-fetch a video to local storage (e.g. for the next video in the feed).
 * Returns immediately if already on device — no duplicate download.
 * On cellular connections this is skipped entirely — videos stream instead
 * of being downloaded, saving significant mobile data.
 */
export function cacheVideo(url: string): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  // Never pre-download on cellular — stream only to protect mobile data
  if (isCellular()) return Promise.resolve(null);
  if (memoryMap.has(url)) return Promise.resolve(memoryMap.get(url)!);
  if (inProgress.has(url)) return inProgress.get(url)!;

  const task = (async (): Promise<string | null> => {
    try {
      await ensureDir(VIDEO_DIR);
      const localPath = VIDEO_DIR + urlToFilename(url);
      const existing = await FileSystem.getInfoAsync(localPath);
      if (existing.exists && (existing as any).size > 0) {
        memoryMap.set(url, localPath);
        return localPath;
      }
      const result = await FileSystem.downloadAsync(url, localPath);
      const check = await FileSystem.getInfoAsync(result.uri);
      if (check.exists && (check as any).size > 0) {
        memoryMap.set(url, result.uri);
        return result.uri;
      }
    } catch {}
    return null;
  })().finally(() => inProgress.delete(url));

  inProgress.set(url, task);
  return task;
}

// ─── Watch → Permanent Store ───────────────────────────────────────────────────

/**
 * Called when a user watches a video. Saves it permanently to device storage.
 * Idempotent — if already stored, updates metadata only (no extra download).
 * The video is NEVER re-downloaded if already on device.
 *
 * Works on both WiFi and cellular — once a video is watched it should always
 * be available offline. Pre-fetching (cacheVideo) still skips cellular.
 */
export async function markVideoWatched(
  postId: string,
  url: string,
  meta: {
    title: string;
    thumbnail: string | null;
    authorId?: string;
    authorHandle?: string;
    authorName?: string;
    authorAvatar?: string | null;
  },
): Promise<void> {
  if (!url || !postId) return;
  if (saveInProgress.has(postId)) return;
  saveInProgress.add(postId);

  try {
    await ensureDir(VIDEO_DIR);
    const filename = urlToFilename(url);
    const localPath = VIDEO_DIR + filename;

    // Check if already on device (in video dir)
    const existing = await FileSystem.getInfoAsync(localPath);
    if (existing.exists && (existing as any).size > 0) {
      // Already stored — just update metadata in registry, no download
      memoryMap.set(url, localPath);
      await dbSaveEntry({
        postId, url, fileUri: localPath,
        fileSize: (existing as any).size ?? 0,
        cachedAt: Date.now(),
        title: meta.title,
        thumbnail: meta.thumbnail,
        authorId: meta.authorId,
        authorHandle: meta.authorHandle,
        authorName: meta.authorName,
        authorAvatar: meta.authorAvatar,
      });
      return;
    }

    // Not yet on device — if a download is in progress, reuse it
    let fileUri = localPath;
    let fileSize = 0;

    if (inProgress.has(url)) {
      const result = await inProgress.get(url)!;
      if (result) {
        // Copy from wherever it landed to our permanent path (if different)
        if (result !== localPath) {
          try {
            await FileSystem.copyAsync({ from: result, to: localPath });
            const info = await FileSystem.getInfoAsync(localPath);
            fileSize = (info as any).size ?? 0;
          } catch {
            fileUri = result;
            const info = await FileSystem.getInfoAsync(result);
            fileSize = (info as any).size ?? 0;
          }
        } else {
          const info = await FileSystem.getInfoAsync(result);
          fileSize = (info as any).size ?? 0;
        }
      }
    }

    if (fileSize === 0) {
      // Download fresh directly to permanent location
      const result = await FileSystem.downloadAsync(url, localPath);
      const info = await FileSystem.getInfoAsync(result.uri);
      if (!info.exists || (info as any).size === 0) return;
      fileUri = result.uri;
      fileSize = (info as any).size ?? 0;
    }

    memoryMap.set(url, fileUri);
    await dbSaveEntry({
      postId, url, fileUri, fileSize,
      cachedAt: Date.now(), title: meta.title, thumbnail: meta.thumbnail,
      authorId: meta.authorId,
      authorHandle: meta.authorHandle,
      authorName: meta.authorName,
      authorAvatar: meta.authorAvatar,
    });
  } catch {
  } finally {
    saveInProgress.delete(postId);
  }
}

// ─── Registry queries ──────────────────────────────────────────────────────────

/** Returns all permanently stored videos, ordered by last-watched newest first. */
export async function getOfflineVideos(): Promise<OfflineVideoEntry[]> {
  return dbGetAll();
}

/**
 * Returns videos the user watched within the last `hours` hours (default 24).
 * These are already on-device — no network needed to play them.
 */
export async function getRecentlyWatchedVideos(hours = 24): Promise<OfflineVideoEntry[]> {
  const since = Date.now() - hours * 60 * 60 * 1000;
  return dbGetRecent(since);
}

/** Total size and count of permanently stored videos. */
export async function getOfflineCacheStats(): Promise<{ count: number; bytes: number }> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ count: number; bytes: number }>(
      "SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as bytes FROM video_registry",
    );
    return { count: row?.count ?? 0, bytes: row?.bytes ?? 0 };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

/** User-initiated: delete ALL stored videos from device. */
export async function clearAllOfflineVideos(): Promise<void> {
  const entries = await dbGetAll();
  await dbDeleteAll();
  memoryMap.clear();
  await FileSystem.deleteAsync(VIDEO_DIR, { idempotent: true }).catch(() => {});
  // Also clear any in-progress downloads
  inProgress.clear();
  // No-op for any entry whose file doesn't exist
  for (const e of entries) {
    await FileSystem.deleteAsync(e.fileUri, { idempotent: true }).catch(() => {});
  }
}

/** User-initiated: delete a single video by postId. */
export async function removeOfflineVideo(postId: string): Promise<void> {
  const entry = await dbGetEntry(postId);
  if (!entry) return;
  await dbDeleteEntry(postId);
  await FileSystem.deleteAsync(entry.fileUri, { idempotent: true }).catch(() => {});
  for (const [k, v] of memoryMap.entries()) {
    if (v === entry.fileUri) memoryMap.delete(k);
  }
}

// ─── Legacy compat / migration helpers ─────────────────────────────────────────

/** No-op — kept so callers don't break. TTL is gone; nothing expires. */
export async function clearExpiredOfflineVideos(): Promise<number> {
  return 0;
}

/** Migrate old AsyncStorage registry entries into SQLite. Safe to call repeatedly. */
export async function migrateOfflineCacheV2toV3(): Promise<void> {
  const KEYS = ["afu_offline_video_registry_v2", "afu_offline_video_registry_v3"];
  for (const key of KEYS) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;
      const entries: OfflineVideoEntry[] = JSON.parse(raw);
      for (const e of entries) {
        // Check if file still exists before migrating
        const info = await FileSystem.getInfoAsync(e.fileUri);
        if (info.exists && (info as any).size > 0) {
          // Move to permanent VIDEO_DIR if not already there
          await ensureDir(VIDEO_DIR);
          const destPath = VIDEO_DIR + urlToFilename(e.url);
          if (e.fileUri !== destPath) {
            try {
              await FileSystem.copyAsync({ from: e.fileUri, to: destPath });
              e.fileUri = destPath;
            } catch {}
          }
          await dbSaveEntry(e);
          memoryMap.set(e.url, e.fileUri);
        }
      }
      await AsyncStorage.removeItem(key);
    } catch {}
  }
}

/** @deprecated Use clearAllOfflineVideos instead */
export async function clearVideoCache(): Promise<void> {
  await clearAllOfflineVideos();
}

export const OFFLINE_TTL_MS_EXPORT = 0; // TTL removed — kept for import compat
