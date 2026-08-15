// ─── Navigation Abstraction ────────────────────────────────────────────────────
// Centralised, typed route helpers that wrap Expo Router.
//
// Why this exists:
//   • Eliminates hardcoded path strings scattered across screens.
//   • Expo Router resolves routes from the local bundle — all navigation works
//     identically online and offline; no network access is needed.
//   • A single file to update when a route is renamed or restructured.
//
// Usage:
//   import { Navigate } from "@/lib/navigation";
//   Navigate.toChat({ id: chatId, name: "Alice" });
//   Navigate.back();

import { router } from "expo-router";

// ─── Param shapes ──────────────────────────────────────────────────────────────

export type ChatParams = {
  id: string;
  name?: string;
  avatar?: string;
};

export type PostParams    = { postId: string };
export type VideoParams   = { id: string };
export type HandleParam   = { handle: string };
export type DeepLinkParam = { code?: string; ref?: string };

// ─── Navigate namespace ────────────────────────────────────────────────────────

export const Navigate = {

  // ── Tabs ─────────────────────────────────────────────────────────────────────

  /** Replace the current stack with the Chats tab (home screen). */
  toChats() {
    router.replace("/(tabs)/chats" as any);
  },

  toDiscover() {
    router.replace("/(tabs)/discover" as any);
  },

  toShorts() {
    router.replace("/(tabs)/shorts" as any);
  },

  toProfile() {
    router.replace("/(tabs)/profile" as any);
  },

  // ── Auth ─────────────────────────────────────────────────────────────────────

  toWelcome() {
    router.replace("/welcome" as any);
  },

  toLogin() {
    router.replace("/(auth)/login" as any);
  },

  toOnboarding() {
    router.replace("/onboarding" as any);
  },

  // ── Chat ─────────────────────────────────────────────────────────────────────

  /** Open an existing chat conversation. */
  toChat(params: ChatParams) {
    router.push({ pathname: "/chat/[id]" as any, params });
  },

  toNewChat() {
    router.push("/new-chat" as any);
  },

  toNewGroup() {
    router.push("/new-group" as any);
  },

  toChatInfo(params: { id: string }) {
    router.push({ pathname: "/chat/[id]/info" as any, params });
  },

  // ── Content ──────────────────────────────────────────────────────────────────

  toPost(params: PostParams) {
    router.push({ pathname: "/post/[id]" as any, params: { id: params.postId } });
  },

  toVideo(params: VideoParams) {
    router.push({ pathname: "/video/[id]" as any, params });
  },

  toCreatePost() {
    router.push("/create" as any);
  },

  // ── User profiles ─────────────────────────────────────────────────────────────

  /** Push a user's public profile page (e.g. "/@alice"). */
  toUserProfile(handle: string) {
    router.push(`/${handle}` as any);
  },

  // ── Search / discovery ───────────────────────────────────────────────────────

  toSearch() {
    router.push("/search" as any);
  },

  toUserDiscovery() {
    router.push("/user-discovery" as any);
  },

  // ── Settings ─────────────────────────────────────────────────────────────────

  toSettings() {
    router.push("/settings" as any);
  },

  toPrivacySettings() {
    router.push("/settings/privacy" as any);
  },

  toStorageSettings() {
    router.push("/settings/storage" as any);
  },

  // ── Wallet / payments ─────────────────────────────────────────────────────────

  toWallet() {
    router.push("/wallet" as any);
  },

  // ── Calls ─────────────────────────────────────────────────────────────────────

  toIncomingCall(params: { callId: string; callerId: string; callerName?: string }) {
    router.push({ pathname: "/call/incoming" as any, params });
  },

  // ── Utilities ─────────────────────────────────────────────────────────────────

  /**
   * Go back one screen. If there is no back-stack entry (e.g. the app was
   * deep-linked directly to this screen), falls back to the Chats home tab
   * so the user is never stranded.
   */
  back() {
    if (router.canGoBack()) {
      router.back();
    } else {
      Navigate.toChats();
    }
  },

  /**
   * Replace the entire navigation stack with a new root screen.
   * Use instead of `router.replace` when you need to reset history
   * (e.g. after sign-out or when handling deep links).
   */
  reset(href: string) {
    router.replace(href as any);
  },
};
