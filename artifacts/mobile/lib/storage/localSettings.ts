// ─── Permanent User Settings Store ─────────────────────────────────────────────
// All user-configurable settings (privacy, chat prefs) are stored
// in SQLite so they survive app restarts and work offline.
//
// Schema: one row per user_id, all settings in columns.
// Sync: written whenever the user changes a setting; re-fetched from server on
// next online launch and merged (server wins on conflicts older than local write).

import { getDB } from "./db";

export type LocalUserSettings = {
  user_id: string;

  // ── Privacy — account ──────────────────────────────────────────────────────
  is_private: boolean;
  show_online_status: boolean;
  show_last_seen: boolean;
  show_bio_publicly: boolean;

  // ── Privacy — visibility ───────────────────────────────────────────────────
  hide_followers_list: boolean;
  hide_following_list: boolean;
  hide_posts_non_followers: boolean;
  hide_from_search: boolean;

  // ── Privacy — messages ─────────────────────────────────────────────────────
  message_privacy: "everyone" | "followers" | "nobody";

  // ── Privacy — interactions ─────────────────────────────────────────────────
  reactions_privacy: "everyone" | "followers" | "nobody";
  allow_tagging: "everyone" | "followers" | "nobody";

  // ── Privacy — data ─────────────────────────────────────────────────────────
  data_personalization: boolean;
  data_analytics: boolean;

  // ── Chat preferences ───────────────────────────────────────────────────────
  chat_read_receipts: boolean;
  chat_media_autodownload: "always" | "wifi_only" | "never";
  chat_bubble_style: string;

  // ── App preferences ────────────────────────────────────────────────────────
  app_language: string;
  app_theme: string;

  stored_at: number;
  updated_at: number;
};

// ─── Defaults ───────────────────────────────────────────────────────────────────

const DEFAULTS: Omit<LocalUserSettings, "user_id" | "stored_at" | "updated_at"> = {
  is_private: false,
  show_online_status: true,
  show_last_seen: true,
  show_bio_publicly: true,
  hide_followers_list: false,
  hide_following_list: false,
  hide_posts_non_followers: false,
  hide_from_search: false,
  message_privacy: "everyone",
  reactions_privacy: "everyone",
  allow_tagging: "everyone",
  data_personalization: true,
  data_analytics: true,
  chat_read_receipts: true,
  chat_media_autodownload: "wifi_only",
  chat_bubble_style: "default",
  app_language: "en",
  app_theme: "system",
};

// ─── Read ───────────────────────────────────────────────────────────────────────

/** Load settings for a user. Returns defaults if not yet stored. */
export async function getLocalSettings(userId: string): Promise<LocalUserSettings> {
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<any>(
      "SELECT * FROM user_settings WHERE user_id = ? LIMIT 1",
      [userId],
    );
    if (!row) return { ...DEFAULTS, user_id: userId, stored_at: 0, updated_at: 0 };
    return rowToSettings(row);
  } catch {
    return { ...DEFAULTS, user_id: userId, stored_at: 0, updated_at: 0 };
  }
}

// ─── Write ──────────────────────────────────────────────────────────────────────

/** Save the full settings object (called after server sync). */
export async function saveLocalSettings(settings: Partial<LocalUserSettings> & { user_id: string }): Promise<void> {
  try {
    const db = await getDB();
    const now = Date.now();
    await db.runAsync(
      `INSERT OR REPLACE INTO user_settings (
        user_id,
        is_private, show_online_status, show_last_seen, show_bio_publicly,
        hide_followers_list, hide_following_list, hide_posts_non_followers, hide_from_search,
        message_privacy, reactions_privacy, allow_tagging,
        data_personalization, data_analytics,
        chat_read_receipts, chat_media_autodownload, chat_bubble_style,
        app_language, app_theme,
        stored_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`,
      [
        settings.user_id,
        b(settings.is_private ?? DEFAULTS.is_private),
        b(settings.show_online_status ?? DEFAULTS.show_online_status),
        b(settings.show_last_seen ?? DEFAULTS.show_last_seen),
        b(settings.show_bio_publicly ?? DEFAULTS.show_bio_publicly),
        b(settings.hide_followers_list ?? DEFAULTS.hide_followers_list),
        b(settings.hide_following_list ?? DEFAULTS.hide_following_list),
        b(settings.hide_posts_non_followers ?? DEFAULTS.hide_posts_non_followers),
        b(settings.hide_from_search ?? DEFAULTS.hide_from_search),
        settings.message_privacy ?? DEFAULTS.message_privacy,
        settings.reactions_privacy ?? DEFAULTS.reactions_privacy,
        settings.allow_tagging ?? DEFAULTS.allow_tagging,
        b(settings.data_personalization ?? DEFAULTS.data_personalization),
        b(settings.data_analytics ?? DEFAULTS.data_analytics),
        b(settings.chat_read_receipts ?? DEFAULTS.chat_read_receipts),
        settings.chat_media_autodownload ?? DEFAULTS.chat_media_autodownload,
        settings.chat_bubble_style ?? DEFAULTS.chat_bubble_style,
        settings.app_language ?? DEFAULTS.app_language,
        settings.app_theme ?? DEFAULTS.app_theme,
        now,
        now,
      ],
    );
  } catch {}
}

/**
 * Patch a single setting value after user changes it in UI.
 * Writes to device immediately (optimistic); caller syncs to server separately.
 */
export async function patchLocalSetting<K extends keyof Omit<LocalUserSettings, "user_id" | "stored_at" | "updated_at">>(
  userId: string,
  key: K,
  value: LocalUserSettings[K],
): Promise<void> {
  try {
    const db = await getDB();
    const sqlValue = typeof value === "boolean" ? (value ? 1 : 0) : value;
    // Auth restoration normally seeds this row, but settings must also work
    // during the first offline session. UPDATE alone silently changed zero
    // rows for new users.
    await db.runAsync(
      "INSERT OR IGNORE INTO user_settings (user_id, stored_at, updated_at) VALUES (?, ?, ?)",
      [userId, Date.now(), Date.now()],
    );
    await db.runAsync(
      `UPDATE user_settings SET ${key} = ?, updated_at = ? WHERE user_id = ?`,
      [sqlValue, Date.now(), userId],
    );
  } catch {}
}

/** Delete settings row when user signs out. */
export async function deleteLocalSettings(userId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM user_settings WHERE user_id = ?", [userId]);
  } catch {}
}

// ─── Internal ───────────────────────────────────────────────────────────────────

function b(val: boolean): number { return val ? 1 : 0; }

function rowToSettings(r: any): LocalUserSettings {
  return {
    user_id: r.user_id,
    is_private: r.is_private === 1,
    show_online_status: r.show_online_status === 1,
    show_last_seen: r.show_last_seen === 1,
    show_bio_publicly: r.show_bio_publicly === 1,
    hide_followers_list: r.hide_followers_list === 1,
    hide_following_list: r.hide_following_list === 1,
    hide_posts_non_followers: r.hide_posts_non_followers === 1,
    hide_from_search: r.hide_from_search === 1,
    message_privacy: r.message_privacy ?? "everyone",
    reactions_privacy: r.reactions_privacy ?? "everyone",
    allow_tagging: r.allow_tagging ?? "everyone",
    data_personalization: r.data_personalization !== 0,
    data_analytics: r.data_analytics !== 0,
    chat_read_receipts: r.chat_read_receipts !== 0,
    chat_media_autodownload: r.chat_media_autodownload ?? "wifi_only",
    chat_bubble_style: r.chat_bubble_style ?? "default",
    app_language: r.app_language ?? "en",
    app_theme: r.app_theme ?? "system",
    stored_at: r.stored_at ?? 0,
    updated_at: r.updated_at ?? 0,
  };
}
