import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { storage, KEYS } from "./storage/mmkv";

const FEED_CACHE_TTL_MS = 30 * 60 * 1000;

const CACHE_KEYS = {
  PROFILE: "offline_profile",
  CONVERSATIONS: "offline_conversations",
  CONTACTS: "offline_contacts",
  MESSAGES_PREFIX: "offline_messages_",
  MOMENTS: "offline_moments",
  NOTIFICATIONS: "offline_notifications",
  PENDING_MESSAGES: "offline_pending_messages",
  FEED_FOR_YOU: "feed_tab_cache_for_you_v3",
  FEED_FOLLOWING: "feed_tab_cache_following_v3",
  FEED_CURSOR_FOR_YOU: "feed_cursor_for_you_v3",
  FEED_CURSOR_FOLLOWING: "feed_cursor_following_v3",
  WALLET: "offline_wallet",
  SHORTS_FOR_YOU: "shorts_feed_cache_for_you_v1",
  SHORTS_FOLLOWING: "shorts_feed_cache_following_v1",
};

export type PendingMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  encrypted_content: string;
  created_at: string;
};

let _isOnline = true;
let _listeners: ((online: boolean) => void)[] = [];
let _netInfoInitialized = false;

function initNetInfo() {
  if (_netInfoInitialized) return;
  _netInfoInitialized = true;

  if (Platform.OS === "web") {
    // navigator.onLine is unreliable at startup — it reports false in sandboxed
    // iframes (Replit canvas/workspace), headless browsers, and other restricted
    // contexts even when the network is reachable. We keep the optimistic `true`
    // default and only update via the browser online/offline events, which are
    // consistently reliable across all environments.
    window.addEventListener("online", () => {
      _isOnline = true;
      _listeners.forEach((fn) => fn(true));
    });
    window.addEventListener("offline", () => {
      _isOnline = false;
      _listeners.forEach((fn) => fn(false));
    });
  } else {
    try {
      const NetInfo = require("@react-native-community/netinfo").default;

      // Fetch initial connectivity state immediately (async) so the very first
      // call to isOnline() after boot reflects reality rather than the optimistic
      // "true" default. This matters on cold start when the phone is offline.
      NetInfo.fetch().then((state: any) => {
        const initialOnline = state.isConnected === true && state.isInternetReachable !== false;
        if (initialOnline !== _isOnline) {
          _isOnline = initialOnline;
          _listeners.forEach((fn) => fn(initialOnline));
        }
      }).catch(() => {});

      NetInfo.addEventListener((state: any) => {
        const newOnline = state.isConnected === true && state.isInternetReachable !== false;
        if (newOnline !== _isOnline) {
          _isOnline = newOnline;
          _listeners.forEach((fn) => fn(newOnline));
        }
      });
    } catch {}
  }
}

initNetInfo();

export function isOnline(): boolean {
  return _isOnline;
}

export function onConnectivityChange(fn: (online: boolean) => void): () => void {
  _listeners.push(fn);
  return () => {
    _listeners = _listeners.filter((l) => l !== fn);
  };
}

export async function cacheProfile(profile: any): Promise<void> {
  try {
    // Write to MMKV synchronously (fast, survives restarts) AND AsyncStorage (compat)
    storage.setObject(KEYS.USER_PROFILE, profile);
    await AsyncStorage.setItem(CACHE_KEYS.PROFILE, JSON.stringify(profile));
  } catch {}
}

export async function getCachedProfile(): Promise<any | null> {
  try {
    // MMKV is synchronous — read it first (zero I/O). Fall back to AsyncStorage.
    const fast = storage.getObject<any>(KEYS.USER_PROFILE);
    if (fast) return fast;
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PROFILE);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Synchronous (no await needed) — MMKV only, no I/O. Used for instant startup. */
export function getCachedProfileSync(): any | null {
  return storage.getObject<any>(KEYS.USER_PROFILE) ?? null;
}

export async function cacheConversations(conversations: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.CONVERSATIONS, JSON.stringify(conversations));
  } catch {}
}

export async function getCachedConversations(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.CONVERSATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function cacheMessages(chatId: string, messages: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.MESSAGES_PREFIX + chatId, JSON.stringify(messages));
  } catch {}
}

export async function getCachedMessages(chatId: string): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.MESSAGES_PREFIX + chatId);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function cacheContacts(contacts: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.CONTACTS, JSON.stringify(contacts));
  } catch {}
}

export async function getCachedContacts(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.CONTACTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function cacheMoments(moments: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.MOMENTS, JSON.stringify(moments));
  } catch {}
}

export async function getCachedMoments(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.MOMENTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function cacheNotifications(notifications: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.NOTIFICATIONS, JSON.stringify(notifications));
  } catch {}
}

export async function getCachedNotifications(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.NOTIFICATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function queueMessage(msg: PendingMessage): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PENDING_MESSAGES);
    const pending: PendingMessage[] = raw ? JSON.parse(raw) : [];
    pending.push(msg);
    await AsyncStorage.setItem(CACHE_KEYS.PENDING_MESSAGES, JSON.stringify(pending));
  } catch {}
}

export async function getPendingMessages(): Promise<PendingMessage[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PENDING_MESSAGES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function clearPendingMessages(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEYS.PENDING_MESSAGES);
  } catch {}
}

export async function removePendingMessage(id: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.PENDING_MESSAGES);
    const pending: PendingMessage[] = raw ? JSON.parse(raw) : [];
    const filtered = pending.filter((m) => m.id !== id);
    await AsyncStorage.setItem(CACHE_KEYS.PENDING_MESSAGES, JSON.stringify(filtered));
  } catch {}
}

export async function cacheWallet(data: { acoin: number; transactions: any[] }): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEYS.WALLET, JSON.stringify({ ...data, cachedAt: Date.now() }));
  } catch {}
}

export async function getCachedWallet(): Promise<{ acoin: number; transactions: any[]; cachedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEYS.WALLET);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function cacheShortsTab(tab: "for_you" | "following", posts: any[]): Promise<void> {
  try {
    const key = tab === "for_you" ? CACHE_KEYS.SHORTS_FOR_YOU : CACHE_KEYS.SHORTS_FOLLOWING;
    await AsyncStorage.setItem(key, JSON.stringify({ posts, cachedAt: Date.now() }));
  } catch {}
}

export async function getCachedShortsTab(tab: "for_you" | "following"): Promise<{ posts: any[]; cachedAt: number } | null> {
  try {
    const key = tab === "for_you" ? CACHE_KEYS.SHORTS_FOR_YOU : CACHE_KEYS.SHORTS_FOLLOWING;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.posts?.length) return null;
    return { posts: parsed.posts, cachedAt: parsed.cachedAt || 0 };
  } catch {
    return null;
  }
}

export async function cacheFeedTab(tab: "for_you" | "following", posts: any[]): Promise<void> {
  try {
    const key = tab === "for_you" ? CACHE_KEYS.FEED_FOR_YOU : CACHE_KEYS.FEED_FOLLOWING;
    await AsyncStorage.setItem(key, JSON.stringify({ posts, cachedAt: Date.now() }));
  } catch {}
}

export async function getCachedFeedTab(tab: "for_you" | "following"): Promise<{ posts: any[]; cachedAt: number; isStale: boolean } | null> {
  try {
    const key = tab === "for_you" ? CACHE_KEYS.FEED_FOR_YOU : CACHE_KEYS.FEED_FOLLOWING;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.posts?.length) return null;
    const isStale = Date.now() - (parsed.cachedAt || 0) > FEED_CACHE_TTL_MS;
    return { posts: parsed.posts, cachedAt: parsed.cachedAt || 0, isStale };
  } catch {
    return null;
  }
}

export async function cacheFeedCursor(tab: "for_you" | "following", oldestCreatedAt: string): Promise<void> {
  try {
    const key = tab === "for_you" ? CACHE_KEYS.FEED_CURSOR_FOR_YOU : CACHE_KEYS.FEED_CURSOR_FOLLOWING;
    await AsyncStorage.setItem(key, oldestCreatedAt);
  } catch {}
}

export async function getFeedCursor(tab: "for_you" | "following"): Promise<string | null> {
  try {
    const key = tab === "for_you" ? CACHE_KEYS.FEED_CURSOR_FOR_YOU : CACHE_KEYS.FEED_CURSOR_FOLLOWING;
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

// ─── Cached user identity ──────────────────────────────────────────────────────
// Persisted in MMKV (survives app restarts, synchronous read). Used to detect
// "was this user previously logged in?" on offline startup before the Supabase
// session can be validated with the network.

const LAST_USER_KEY = "last_authed_user_id";

/** Persist the authenticated user's ID synchronously. Call whenever user changes. */
export function setCachedUserId(userId: string): void {
  try { storage.setString(LAST_USER_KEY, userId); } catch {}
}

/** Read the last authenticated user's ID instantly (no I/O). */
export function getCachedUserId(): string | null {
  try { return storage.getString(LAST_USER_KEY) ?? null; } catch { return null; }
}

/** Erase the cached user ID on explicit sign-out. */
export function clearCachedUserId(): void {
  try { storage.delete(LAST_USER_KEY); } catch {}
}

/**
 * Wipes every byte of user-specific local data so that switching accounts
 * never leaks one account's data into another.
 *
 * Call this BEFORE setting the new Supabase session.
 *
 * Covers:
 *  - MMKV profile, feed cursors, wallet, search history, push token, etc.
 *  - AsyncStorage: profile, conversations, messages, feed caches, search,
 *    feed algorithm weights, media upload usage, feature usage counters,
 *    wallet, suggested-users dismiss list, pending messages.
 */
export async function clearAccountCache(): Promise<void> {
  try {
    // ── MMKV (synchronous, zero I/O) ──────────────────────────────────────────
    storage.delete(KEYS.USER_PROFILE);
    storage.delete(KEYS.USER_ID);
    storage.delete(LAST_USER_KEY);
    storage.delete(KEYS.FEED_CURSOR_FOR_YOU);
    storage.delete(KEYS.FEED_CURSOR_FOLLOWING);
    storage.delete(KEYS.FEED_SCROLL_OFFSET);
    storage.delete(KEYS.VIEWED_POST_IDS);
    storage.delete(KEYS.UNREAD_NOTIF_COUNT);
    storage.delete(KEYS.WALLET_BALANCE);
    storage.delete(KEYS.WALLET_CACHED_AT);
    storage.delete(KEYS.SEARCH_HISTORY);
    storage.delete(KEYS.PUSH_TOKEN);
    storage.delete(KEYS.INTERESTS);

    // ── SQLite — per-account permanent data ───────────────────────────────────
    // Chat folders and video progress are user-specific and must be cleared on
    // account switch so they never leak from one account to another.
    // (Messages, conversations, contacts, feed, settings are cleared separately
    //  by their own delete* helpers or are the new user's data anyway.)
    import("./storage/chatFolders")
      .then(({ clearAllFolders }) => clearAllFolders())
      .catch(() => {});
    import("./videoProgress")
      .then(({ clearAllVideoProgress }) => clearAllVideoProgress())
      .catch(() => {});

    // ── AsyncStorage (async batch) ────────────────────────────────────────────
    const allKeys = await AsyncStorage.getAllKeys();

    // Per-chat message caches  →  "offline_messages_<chatId>"
    const messageCacheKeys = allKeys.filter((k) =>
      k.startsWith(CACHE_KEYS.MESSAGES_PREFIX)
    );

    // Daily feature-usage counters  →  "afuchat_feature_<name>_<YYYY-MM-DD>"
    const featureUsageKeys = allKeys.filter((k) =>
      k.startsWith("afuchat_feature_")
    );

    await AsyncStorage.multiRemove([
      // Core offline caches (legacy AsyncStorage — SQLite is now the source of truth)
      CACHE_KEYS.PROFILE,
      CACHE_KEYS.CONVERSATIONS,
      CACHE_KEYS.CONTACTS,
      CACHE_KEYS.MOMENTS,
      CACHE_KEYS.NOTIFICATIONS,
      CACHE_KEYS.PENDING_MESSAGES,
      CACHE_KEYS.WALLET,
      // Feed caches
      CACHE_KEYS.FEED_FOR_YOU,
      CACHE_KEYS.FEED_FOLLOWING,
      CACHE_KEYS.FEED_CURSOR_FOR_YOU,
      CACHE_KEYS.FEED_CURSOR_FOLLOWING,
      // Search (account-personal history + saved searches + pinned results)
      "@afuchat_search_history",
      "@afuchat_saved_searches",
      "@afuchat_pinned_results",
      // Feed algorithm personalisation weights
      "feed_interaction_weights_v1",
      // Media upload quota cache
      "@afuchat:storage_usage_v1",
      // UI preferences that are per-account
      "suggested_users_dismissed_v1",
      // Legacy chat folders key (already migrated to SQLite on v13 upgrade)
      "chat_folders_v1",
      ...messageCacheKeys,
      ...featureUsageKeys,
    ]);
  } catch {}
}

/**
 * Nuclear wipe — clears every byte of local user data.
 *
 * Used on explicit sign-out so the device looks exactly like a fresh install.
 * Covers ALL stores: MMKV, AsyncStorage, and every SQLite table.
 *
 * Safe to call even if individual stores fail — each store is wrapped
 * in its own try/catch so one failure never blocks the others.
 */
export async function wipeAllLocalData(): Promise<void> {
  // ── 1. MMKV: instant synchronous clear ─────────────────────────────────────
  try { storage.clearAll(); } catch {}

  // ── 2. AsyncStorage: full wipe (no selective removal) ──────────────────────
  try { await AsyncStorage.clear(); } catch {}

  // ── 3. SQLite: wipe every user-data table ──────────────────────────────────
  try {
    const { getDB } = await import("./storage/db");
    const db = await getDB();
    const tables = [
      "conversations", "messages", "feed_posts", "notifications",
      "search_history", "media_cache", "offline_queue", "contacts",
      "video_registry", "phone_contact_names", "chat_folders",
      "user_profiles", "user_settings", "call_history",
    ];
    for (const t of tables) {
      try { await db.runAsync(`DELETE FROM ${t}`); } catch {}
    }
  } catch {}
}
