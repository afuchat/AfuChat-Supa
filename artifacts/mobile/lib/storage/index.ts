// ─── Device Storage — permanent on-device store ────────────────────────────────
// Data is stored once, lives forever, never auto-expired.
// Only removed by internal cache maintenance or when the app is uninstalled.
//
// Storage tiers:
//   SecureStore   → auth tokens (Android Keystore / iOS Keychain)
//   SQLite        → messages, conversations, contacts, folders, settings,
//                   offline queue, call history, AI memory, video progress
//   MMKV          → fast-read user ID, profile snapshot, wallet, preferences
//   documentDir   → avatars, chat attachments, downloaded videos (permanent)
//   cacheDir      → upload staging, feed prefetch thumbnails (OS-clearable)
//
// Clearing the Android app CACHE (Settings → App → Storage → Clear Cache)
// only removes cacheDirectory files.  Everything above — SQLite, MMKV,
// SecureStore, documentDirectory — is UNAFFECTED and survives a cache clear.
//
// See also: lib/storage/tempCache.ts — cacheDirectory manager (OS-clearable temp files)

export { storage, KEYS } from "./mmkv";
export { getDB } from "./db";
export * from "./localMessages";
export * from "./localConversations";
export * from "./localFeed";
export * from "./localContacts";
export * from "./localProfile";
export * from "./localSettings";
export * from "./mediaDownloader";
export * from "./syncQueue";
export * from "./mediaCache";
export * from "./chatAttachmentCache";
export * from "./searchHistory";
export * from "./tempCache";
export * from "./chatFolders";

import { getDB } from "./db";
import { startSyncQueue } from "./syncQueue";
import { migrateOfflineCacheV2toV3 } from "../videoCache";
import { cleanupTempCache, _sweepOrphanedRecordings } from "./tempCache";

let _initialized = false;

/**
 * Call once from the root _layout.tsx on app start.
 *
 * On first launch / after an upgrade:
 *   1. Opens the SQLite DB and runs all schema migrations (v1 → v14).
 *      • v13 adds the chat_folders table (previously AsyncStorage).
 *      • v14 adds the video_progress table (previously AsyncStorage).
 *   2. Migrates any legacy AsyncStorage video registry into SQLite.
 *   3. The chat_folders and video_progress AsyncStorage → SQLite migrations
 *      run lazily on first read (inside chatFolders.ts / videoProgress.ts)
 *      so they don't block the startup path.
 *   4. Starts the offline action queue listener (drains on reconnect).
 *   5. Cleans up temp cacheDirectory files older than 2 days (capped at 15 MB).
 *   6. Sweeps orphaned expo-av recording files from the root of cacheDirectory.
 *
 * No permanent user data is purged — only expired temp files are removed.
 */
export async function initDeviceStorage(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  try {
    // Open DB and run all schema migrations (creates all tables if first launch)
    await getDB();
    // Migrate old AsyncStorage video registry into SQLite
    migrateOfflineCacheV2toV3().catch(() => {});
    // Start listening for network changes to drain the offline action queue
    startSyncQueue();
    // Clean up temp cache files older than 2 days (runs in background)
    cleanupTempCache().catch(() => {});
    // Sweep orphaned expo-av recording files from root of cacheDirectory
    // (voice recordings left behind by previous app versions before the
    //  post-upload deleteAsync fix was added — pattern: "Recording-*.m4a")
    _sweepOrphanedRecordings().catch(() => {});
  } catch {}
}
