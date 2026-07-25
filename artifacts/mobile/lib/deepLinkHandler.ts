/**
 * deepLinkHandler.ts
 *
 * Parses incoming URLs and dispatches navigation actions or referral signals.
 *
 * Supported URL formats:
 *   afuchat://settings              -> open Settings screen
 *   afuchat://wallet                -> open Wallet screen
 *   afuchat://chat/:id              -> open a specific chat
 *   afuchat://profile               -> open My Profile tab
 *   afuchat://discover              -> open Discover tab
 *   afuchat://chats                 -> open Chats tab
 *   afuchat://ai                    -> open AfuAI
 *   afuchat://premium               -> open Premium screen
 *   afuchat://join/:code            -> join a group/channel (UUID or shortId)
 *   https://afuchat.com/join/:code  -> join a group/channel (UUID or shortId)
 *   https://afuchat.com/john        -> referral code "JOHN"
 *   https://afuchat.com/john?ref=JOHN -> referral code "JOHN" (explicit param)
 *   afuchat://john                  -> referral code "JOHN"
 *   afuchat://ref/JOHN              -> referral code "JOHN" (dedicated path)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { decodeId } from "./shortId";

export const REFERRER_KEY    = "referrer_handle";
export const PENDING_JOIN_KEY = "pending_join_group_id";

export type DeepLinkAction =
  | { type: "referral"; code: string }
  | { type: "join_group"; groupId: string; code: string }
  | { type: "navigate"; path: string; params?: Record<string, string> }
  | null;

/**
 * Direct navigation routes — single-segment afuchat:// paths that map to
 * app screens. Checked BEFORE referral logic so system paths are never
 * misidentified as user handles.
 */
const NAV_ROUTES: Record<string, string> = {
  // ── Tab screens ────────────────────────────────────────────────────────────
  discover:           "/(tabs)/discover",
  chats:              "/(tabs)/chats",
  chat:               "/(tabs)/chats",
  search:             "/(tabs)/search",
  communities:        "/(tabs)/communities",
  contacts:           "/(tabs)/contacts",
  apps:               "/(tabs)/apps",
  shorts:             "/(tabs)/shorts",
  // ── Profile ────────────────────────────────────────────────────────────────
  profile:            "/(tabs)/me",
  me:                 "/(tabs)/me",
  followers:          "/followers",
  // ── Core screens ──────────────────────────────────────────────────────────
  settings:           "/settings",
  wallet:             "/wallet",
  ai:                 "/ai",
  premium:            "/premium",
  prestige:           "/prestige",
  referral:           "/referral",
  store:              "/store",
  support:            "/support",
  about:              "/about",
  terms:              "/terms",
  help:               "/help",
  privacy:            "/privacy",
  lab:                "/lab",
  // ── Content creation ──────────────────────────────────────────────────────
  moments:            "/moments",
  "create-post":      "/create-post",
  stories:            "/stories/view",
  // ── Social ────────────────────────────────────────────────────────────────
  achievements:       "/achievements",
  collections:        "/collections",
  "saved-posts":      "/saved-posts",
  "my-posts":         "/my-posts",
  "watch-history":    "/watch-history",
  // ── Commerce & mini-apps ──────────────────────────────────────────────────
  shop:               "/shop",
  games:              "/games",
  freelance:          "/freelance",
  gifts:              "/gifts",
  business:           "/business",
};

/**
 * These path segments are NOT user handles — they are app routes.
 * Any single-segment URL that matches one of these is not treated as a referral.
 */
const SYSTEM_ROUTES = new Set([
  ...Object.keys(NAV_ROUTES),
  "wallet", "settings", "chat", "premium", "referral", "onboarding",
  "login", "register", "search", "discover", "communities", "contacts",
  "apps", "moments", "shorts", "stories", "post", "video", "article",
  "shop", "freelance", "company", "mini-programs", "prestige",
  "username-market", "match", "gifts", "events", "market", "jobs",
  "support", "qr-scanner", "digital-id", "language-settings",
  "me", "call", "red-envelope", "p",
  "saved-posts", "my-posts", "profile", "followers", "user-discovery",
  "linked-accounts", "device-security", "status", "contact", "group",
  "channel", "digital-events", "ref", "app", "download", "privacy",
  "terms", "about", "help", "feedback", "notifications", "likes",
  "explore", "trending", "feed", "home", "index", "join",
  "lab", "achievements", "watch-history",
  "business", "collections", "games", "welcome",
  "store", "paid-communities", "phone-contacts", "file-manager",
  "create-post", "username-market", "user-discovery",
  "chat-search", "profile-not-found", "profile-private",
  "id", "report", "register", "reset-password", "chat-info",
]);

/** Validate that a string looks like a real user handle */
function isValidHandle(s: string): boolean {
  return /^[a-z0-9_]{2,30}$/.test(s);
}

/** Validate a UUID v4 */
function isUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Validate a base-62 shortId code (10-25 alphanumeric chars) */
function isShortCode(s: string): boolean {
  return s.length >= 10 && s.length <= 25 && /^[0-9A-Za-z]+$/.test(s);
}

/**
 * Parse a URL and return a DeepLinkAction if one is identified, or null.
 *
 * Priority order:
 *  1. /join/:code  — group/channel invite
 *  2. /chat/:id    — direct chat open (two-segment)
 *  3. Navigation routes (afuchat://settings, etc.)
 *  4. ?ref= query param  — explicit referral
 *  5. /ref/:handle path  — dedicated referral path
 *  6. /:handle  — profile / implicit referral
 *
 * Side-effects:
 *  - Persists referral codes to AsyncStorage (REFERRER_KEY).
 *  - Persists pending group-join codes to AsyncStorage (PENDING_JOIN_KEY).
 */
export async function handleIncomingUrl(url: string | null | undefined): Promise<DeepLinkAction> {
  if (!url) return null;

  try {
    const normalised = url.startsWith("afuchat://")
      ? url.replace("afuchat://", "https://afuchat.com/")
      : url;

    const parsed   = new URL(normalised);
    const segments = parsed.pathname.split("/").filter(Boolean);

    // 1. /join/:code -- group/channel invite link (UUID or shortId)
    if (segments.length === 2 && segments[0] === "join") {
      const code = segments[1];
      let groupId: string | null = null;

      if (isUUID(code)) {
        groupId = code;
      } else if (isShortCode(code)) {
        try {
          const decoded = decodeId(code);
          if (isUUID(decoded)) groupId = decoded;
        } catch {}
      }

      if (groupId) {
        await AsyncStorage.setItem(PENDING_JOIN_KEY, code);
        return { type: "join_group", groupId, code };
      }
    }

    // 2. /chat/:id -- open a specific conversation
    if (segments.length === 2 && segments[0] === "chat" && isUUID(segments[1])) {
      return { type: "navigate", path: "/chat/[id]", params: { id: segments[1] } };
    }

    // 3. Single-segment navigation routes (afuchat://settings, afuchat://wallet, etc.)
    if (segments.length === 1) {
      const seg = segments[0].toLowerCase();
      const navPath = NAV_ROUTES[seg];
      if (navPath) {
        return { type: "navigate", path: navPath };
      }
    }

    // 4. Explicit ?ref=HANDLE query param -- highest priority for referrals
    const refParam = parsed.searchParams.get("ref");
    if (refParam) {
      const code = refParam.trim().toUpperCase();
      if (code.length >= 2) {
        await AsyncStorage.setItem(REFERRER_KEY, code);
        return { type: "referral", code };
      }
    }

    // 5. Dedicated /ref/HANDLE path (e.g. afuchat://ref/JOHN)
    if (segments.length === 2 && segments[0] === "ref") {
      const handle = segments[1].toLowerCase();
      if (isValidHandle(handle)) {
        const code = handle.toUpperCase();
        await AsyncStorage.setItem(REFERRER_KEY, code);
        return { type: "referral", code };
      }
    }

    // 6. Profile-style link: https://afuchat.com/handle
    if (segments.length === 1) {
      const handle = segments[0].toLowerCase();
      if (!SYSTEM_ROUTES.has(handle) && isValidHandle(handle)) {
        const code = handle.toUpperCase();
        await AsyncStorage.setItem(REFERRER_KEY, code);
        return { type: "referral", code };
      }
    }
  } catch {
    // Malformed URL -- silently ignore
  }

  return null;
}

/** Consume a pending group-join code -- returns it and clears the storage entry */
export async function consumePendingJoin(): Promise<string | null> {
  try {
    const code = await AsyncStorage.getItem(PENDING_JOIN_KEY);
    if (code) await AsyncStorage.removeItem(PENDING_JOIN_KEY);
    return code;
  } catch {
    return null;
  }
}

/**
 * Clear the stored referrer after it has been consumed by onboarding.
 * Call this after successfully submitting the referral, not before.
 */
export async function clearStoredReferrer(): Promise<void> {
  try {
    await AsyncStorage.removeItem(REFERRER_KEY);
  } catch {}
}
