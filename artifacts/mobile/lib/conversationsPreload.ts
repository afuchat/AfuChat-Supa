// ─── Conversations Pre-warm Cache ──────────────────────────────────────────────
//
// Loads the local SQLite conversation list into memory as early as possible —
// before any screen renders — so ChatsScreen can initialize its React state
// synchronously from this memory snapshot instead of waiting for an async
// SQLite read (which causes a skeleton flash even for returning users).
//
// Usage:
//   1. Call preloadConversations() at module-evaluation time (e.g. _layout.tsx)
//      as soon as you know a user is cached. Fire-and-forget — no await needed.
//   2. ChatsScreen reads getPreloadedConversations() inside useState() initializer.
//   3. Call invalidateConversationsPreload() on sign-out / account switch.

import { Platform } from "react-native";
import { getLocalConversations } from "./storage/localConversations";
import type { LocalConversation } from "./storage/localConversations";

let _cache: LocalConversation[] | null = null;
let _promise: Promise<void> | null = null;

/**
 * Start loading conversations from SQLite into memory.
 * Idempotent — safe to call multiple times; only runs once per session.
 * Returns immediately; loading happens in the background.
 */
export function preloadConversations(): void {
  if (_cache !== null || _promise !== null) return;
  _promise = getLocalConversations()
    .then((rows) => {
      _cache = rows;
    })
    .catch(() => {
      _cache = [];
    })
    .finally(() => {
      _promise = null;
    });
}

/**
 * Synchronously get the preloaded conversations.
 * Returns an empty array if preload hasn't finished yet (first install).
 */
export function getPreloadedConversations(): LocalConversation[] {
  return _cache ?? [];
}

/**
 * Returns true once preload has finished AND found at least one conversation.
 * Use this to decide whether to skip loading skeleton.
 */
export function hasPreloadedConversations(): boolean {
  return _cache !== null && _cache.length > 0;
}

/**
 * Discard the in-memory cache.
 * Call on sign-out or account switch so the next session gets a fresh read.
 */
export function invalidateConversationsPreload(): void {
  _cache = null;
  _promise = null;
}
