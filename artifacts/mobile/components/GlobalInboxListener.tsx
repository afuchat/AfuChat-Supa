/**
 * GlobalInboxListener — root-level real-time message receiver.
 *
 * Lives inside <AuthProvider> in _layout.tsx so it is always mounted while
 * the user is logged in, regardless of which screen is visible.
 *
 * What it does:
 *  1. Subscribes to the `user-inbox:${userId}` Supabase Broadcast channel.
 *     Senders publish here immediately after the DB insert (~20 ms delivery).
 *  2. Emits every incoming message to globalMessageEvents so chat/[id].tsx
 *     can pick it up as a fast path (before the Postgres Changes event fires).
 *  3. Shows an animated in-app banner when a message arrives in a chat the
 *     user is NOT currently viewing.
 *  4. Swipe-to-dismiss and tap-to-open-chat are supported.
 *  5. Auto-reconnects on CLOSED / CHANNEL_ERROR with exponential backoff
 *     (max 15 s) so the ~20 ms fast path survives network hiccups.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Image,
  Platform,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/lib/supabase";
import { getActiveChatId } from "@/lib/chatVisited";
import {
  emitIncomingMessage,
  IncomingMessage,
} from "@/lib/globalMessageEvents";

// ─── Banner state ──────────────────────────────────────────────────────────────
type BannerData = {
  chatId: string;
  senderName: string;
  senderAvatar: string | null;
  preview: string;
};

const BANNER_HEIGHT = 80;
const AUTO_DISMISS_MS = 4500;

// ─── Component ─────────────────────────────────────────────────────────────────
export function GlobalInboxListener() {
  const { user } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [banner, setBanner] = useState<BannerData | null>(null);
  const slideY = useRef(new Animated.Value(-(BANNER_HEIGHT + 20))).current;
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentIds = useRef(new Set<string>());

  // ── Dismiss ────────────────────────────────────────────────────────────────
  const dismiss = useCallback(() => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    Animated.timing(slideY, {
      toValue: -(BANNER_HEIGHT + 20),
      duration: 220,
      useNativeDriver: Platform.OS !== "web",
    }).start(() => setBanner(null));
  }, [slideY]);

  // ── Show banner ────────────────────────────────────────────────────────────
  const showBanner = useCallback(
    (data: BannerData) => {
      setBanner(data);
      slideY.setValue(-(BANNER_HEIGHT + 20));
      Animated.spring(slideY, {
        toValue: 0,
        useNativeDriver: Platform.OS !== "web",
        bounciness: 6,
        speed: 18,
      }).start();
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(dismiss, AUTO_DISMISS_MS);
    },
    [slideY, dismiss],
  );

  // ── Swipe-up to dismiss ────────────────────────────────────────────────────
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy < -5,
      onPanResponderMove: (_, g) => {
        if (g.dy < 0) slideY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy < -30 || g.vy < -0.5) {
          dismiss();
        } else {
          Animated.spring(slideY, {
            toValue: 0,
            useNativeDriver: Platform.OS !== "web",
            bounciness: 4,
          }).start();
        }
      },
    }),
  ).current;

  // ── Message handler — stored in a ref so the subscription effect never
  //    needs to re-run (and tear down the channel) just because showBanner
  //    got a new reference. ──────────────────────────────────────────────────
  const showBannerRef = useRef(showBanner);
  showBannerRef.current = showBanner;
  const userIdRef = useRef(user?.id);
  userIdRef.current = user?.id;

  const handlePayload = useCallback((payload: any) => {
    const msg = payload as IncomingMessage;
    if (!msg?.id || !msg?.chat_id || !msg?.sender_id) return;
    if (msg.sender_id === userIdRef.current) return;

    // Deduplicate — broadcast may fire more than once if sender re-tries
    if (recentIds.current.has(msg.id)) return;
    recentIds.current.add(msg.id);
    setTimeout(() => recentIds.current.delete(msg.id), 15_000);

    // Emit to global event bus → chat/[id].tsx fast path picks it up
    emitIncomingMessage(msg);

    // No banner if user is already viewing that chat
    if (getActiveChatId() === msg.chat_id) return;

    const senderName = msg.sender_display_name || "Someone";

    let preview = "New message";
    if (msg.encrypted_content) {
      preview = msg.encrypted_content.slice(0, 80);
    } else if (msg.attachment_type) {
      const icons: Record<string, string> = {
        image: "📷 Photo",
        video: "🎥 Video",
        audio: "🎵 Voice message",
        file: "📎 File",
        gif: "🎞 GIF",
      };
      preview = icons[msg.attachment_type] ?? "📎 Attachment";
    }

    showBannerRef.current({
      chatId: msg.chat_id,
      senderName,
      senderAvatar: msg.sender_avatar_url ?? null,
      preview,
    });
  }, []); // stable — never recreated; reads userId via ref

  // ── Supabase Broadcast subscription with auto-reconnect ────────────────────
  // Only depends on user?.id — handlePayload is stable (via ref pattern above).
  // This prevents the channel from tearing down and re-creating every time
  // unrelated state changes cause showBanner to get a new reference.
  useEffect(() => {
    if (!user?.id) return;

    let destroyed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;
    let currentChannel: ReturnType<typeof supabase.channel> | null = null;

    const connect = () => {
      if (destroyed) return;

      const ch = supabase
        .channel(`user-inbox:${user.id}`, {
          config: { broadcast: { self: false } },
        })
        .on("broadcast", { event: "new_message" }, ({ payload }) => {
          handlePayload(payload);
        })
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") {
            // Connected — reset backoff counter
            retryCount = 0;
          } else if (
            status === "CLOSED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            // Connection dropped — reconnect with exponential backoff (max 15 s)
            if (currentChannel) {
              supabase.removeChannel(currentChannel).catch(() => {});
              currentChannel = null;
            }
            if (!destroyed) {
              const delay = Math.min(500 * Math.pow(2, retryCount), 15_000);
              retryCount = Math.min(retryCount + 1, 6);
              reconnectTimer = setTimeout(connect, delay);
            }
          }
        });

      currentChannel = ch;
    };

    connect();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (currentChannel) supabase.removeChannel(currentChannel).catch(() => {});
    };
  }, [user?.id, handlePayload]);

  // ── Cleanup timer on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  if (!banner) return null;

  const topOffset = insets.top + 8;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        { top: topOffset, transform: [{ translateY: slideY }] },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        activeOpacity={0.92}
        style={[
          styles.banner,
          {
            backgroundColor: colors.card,
            shadowColor: colors.text,
          },
        ]}
        onPress={() => {
          dismiss();
          router.push({
            pathname: "/chat/[id]",
            params: { id: banner.chatId },
          } as any);
        }}
      >
        {/* Avatar */}
        {banner.senderAvatar ? (
          <Image
            source={{ uri: banner.senderAvatar }}
            style={styles.avatar}
          />
        ) : (
          <View
            style={[
              styles.avatar,
              styles.avatarFallback,
              { backgroundColor: colors.accent },
            ]}
          >
            <Text style={styles.avatarLetter}>
              {banner.senderName.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Text content */}
        <View style={styles.textCol}>
          <Text
            style={[styles.name, { color: colors.text }]}
            numberOfLines={1}
          >
            {banner.senderName}
          </Text>
          <Text
            style={[styles.preview, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {banner.preview}
          </Text>
        </View>

        {/* Close button */}
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.closeBtn}
        >
          <Text style={[styles.closeIcon, { color: colors.textMuted }]}>
            ✕
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 20,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 12,
    minHeight: BANNER_HEIGHT,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  textCol: {
    flex: 1,
    gap: 3,
  },
  name: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  preview: {
    fontSize: 13,
    opacity: 0.82,
  },
  closeBtn: {
    paddingLeft: 10,
  },
  closeIcon: {
    fontSize: 14,
    fontWeight: "600",
  },
});
