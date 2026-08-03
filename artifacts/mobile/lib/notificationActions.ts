/**
 * notificationActions.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles notification action button responses (Reply, Mark Read, etc.)
 * Called by pushNotifications.ts when a user interacts with an action button.
 *
 * Never crashes the app — all errors are caught and logged.
 */

import { supabase } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────────────────

type NotifData = Record<string, string>;

interface NotificationResponse {
  userText?: string; // text from inline reply input
  notification: {
    request: {
      content: {
        data: NotifData;
      };
    };
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Main dispatcher
// ═════════════════════════════════════════════════════════════════════════════

export async function handleNotificationAction(
  actionIdentifier: string,
  data: NotifData,
  response: NotificationResponse,
): Promise<void> {
  try {
    switch (actionIdentifier) {
      case "chat_reply":
        await _handleChatReply(data, response.userText ?? "");
        break;

      case "mark_read":
        await _handleMarkRead(data);
        break;

      case "view_post":
        // Navigation is handled by the tap routing in pushNotifications.ts
        break;

      case "view_order":
        // Navigation is handled by the tap routing in pushNotifications.ts
        break;

      case "confirm_delivery":
        await _handleConfirmDelivery(data);
        break;

      default:
        break;
    }
  } catch (err) {
    // Never crash the app for a notification action
    console.warn("[NotifAction]", actionIdentifier, "error:", err);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// Action handlers
// ═════════════════════════════════════════════════════════════════════════════

async function _handleChatReply(data: NotifData, text: string): Promise<void> {
  const chatId = data.chatId ?? data.chat_id;
  if (!chatId || !text.trim()) return;

  const session = (await supabase.auth.getSession()).data.session;
  if (!session) return;

  await supabase.from("messages").insert({
    chat_id: chatId,
    sender_id: session.user.id,
    content: text.trim(),
    message_type: "text",
  });
}

async function _handleMarkRead(data: NotifData): Promise<void> {
  const chatId = data.chatId ?? data.chat_id;
  if (!chatId) return;

  const session = (await supabase.auth.getSession()).data.session;
  if (!session) return;

  // Update last_read_at for this user in this chat
  await supabase
    .from("chat_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("chat_id", chatId)
    .eq("user_id", session.user.id);
}

async function _handleConfirmDelivery(data: NotifData): Promise<void> {
  const orderId = data.orderId ?? data.order_id;
  if (!orderId) return;

  const session = (await supabase.auth.getSession()).data.session;
  if (!session) return;

  await supabase
    .from("orders")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("buyer_id", session.user.id);
}
