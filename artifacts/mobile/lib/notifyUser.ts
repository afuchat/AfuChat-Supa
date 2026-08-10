/**
 * Client-side notification event writers.
 *
 * Push delivery is still server-side (notifications INSERT -> pg_net ->
 * push-notification-trigger). These helpers only create the durable event row
 * for event types that do not already have a database trigger of their own.
 * Message, incoming-call, and commerce helpers remain compatibility no-ops
 * because their source tables already trigger delivery.
 */

import { supabase } from "@/lib/supabase";

type NotificationPayload = Record<string, any>;

async function writeNotification(params: {
  userId?: string | null;
  type: string;
  actorId?: string | null;
  entityId?: string | null;
  entityType?: string | null;
  postId?: string | null;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (!params.userId || !params.actorId || params.userId === params.actorId) return;

  const { error } = await supabase.from("notifications").insert({
    user_id: params.userId,
    type: params.type,
    actor_id: params.actorId,
    entity_id: params.entityId ?? params.postId ?? null,
    entity_type: params.entityType ?? (params.postId ? "post" : null),
    post_id: params.postId ?? null,
    title: params.title ?? null,
    body: params.body ?? null,
    data: params.data ?? {},
  });

  if (error) {
    console.warn("[Notify] notification event insert failed:", error.message);
  }
}

// The messages INSERT trigger is the source of truth for chat pushes.
export async function notifyNewMessage(_p: NotificationPayload): Promise<void> {}

export async function notifyPostLike(p: NotificationPayload): Promise<void> {
  await writeNotification({
    userId: p.postAuthorId ?? p.postOwnerId,
    actorId: p.likerUserId,
    type: "like",
    postId: p.postId,
    title: p.likerName || "Someone",
    body: "Liked your post",
    data: { postId: String(p.postId ?? "") },
  });
}

export async function notifyPostReply(p: NotificationPayload): Promise<void> {
  await writeNotification({
    userId: p.postAuthorId ?? p.postOwnerId,
    actorId: p.replierUserId,
    type: "reply",
    postId: p.postId,
    title: p.replierName || "Someone",
    body: p.replyPreview || "Replied to your comment",
    data: { postId: String(p.postId ?? "") },
  });
}

export async function notifyNewFollower(p: NotificationPayload): Promise<void> {
  await writeNotification({
    userId: p.targetUserId ?? p.followedUserId,
    actorId: p.followerUserId,
    type: "follow",
    title: p.followerName || "Someone",
    body: "Started following you",
    data: { actorHandle: String(p.followerHandle ?? "") },
  });
}

/** Backward-compatible name used by older feed components. */
export const notifyNewFollow = notifyNewFollower;

export async function notifyMention(p: NotificationPayload): Promise<void> {
  await writeNotification({
    userId: p.mentionedUserId,
    actorId: p.mentionerUserId,
    type: "mention",
    entityId: p.postId ?? p.chatId,
    entityType: p.postId ? "post" : p.chatId ? "chat" : null,
    postId: p.postId,
    title: p.mentionerName || "Someone",
    body: p.context || "Mentioned you",
    data: { postId: String(p.postId ?? ""), chatId: String(p.chatId ?? "") },
  });
}

export async function notifyGiftReceived(p: NotificationPayload): Promise<void> {
  await writeNotification({
    userId: p.recipientId,
    actorId: p.senderUserId,
    type: "gift",
    entityId: p.chatId,
    entityType: p.chatId ? "chat" : null,
    title: p.senderName || "Someone",
    body: `Sent you ${p.giftName || "a gift"}`,
    data: { chatId: String(p.chatId ?? ""), giftName: String(p.giftName ?? "") },
  });
}

// These source tables already have server-side order triggers.
export async function notifyOrderShipped(_p: NotificationPayload): Promise<void> {}
export async function notifyOrderStatusChanged(_p: NotificationPayload): Promise<void> {}
export async function notifyIncomingCall(_p: NotificationPayload): Promise<void> {}
export async function notifyOrderPlaced(_p: NotificationPayload): Promise<void> {}
export async function notifyDeliveryConfirmed(_p: NotificationPayload): Promise<void> {}
export async function notifyDisputeRaised(_p: NotificationPayload): Promise<void> {}
export async function notifyRefundIssued(_p: NotificationPayload): Promise<void> {}
export async function notifyOrderReview(_p: NotificationPayload): Promise<void> {}

export async function notifyPaymentReceived(p: NotificationPayload): Promise<void> {
  await writeNotification({
    userId: p.recipientId ?? p.userId,
    actorId: p.senderUserId ?? p.actorId,
    type: "payment",
    entityId: p.referenceId,
    entityType: p.referenceType,
    title: p.senderName || "Payment received",
    body: `${p.amount ?? ""} ${p.currency || "ACoin"} received`.trim(),
    data: { referenceId: String(p.referenceId ?? "") },
  });
}

export async function notifyMissedCall(p: NotificationPayload): Promise<void> {
  // On timeout, the caller is the person who needs the missed-call event.
  await writeNotification({
    userId: p.recipientId ?? p.callerId,
    actorId: p.callerId,
    type: "missed_call",
    entityId: p.callId,
    entityType: "call",
    title: p.callerName || "Missed call",
    body: "Missed your call",
    data: { callId: String(p.callId ?? "") },
  });
}

export async function notifySystemMessage(p: NotificationPayload): Promise<void> {
  const recipients = Array.isArray(p.recipientIds) ? p.recipientIds : [];
  await Promise.all(recipients.map((userId: string) => writeNotification({
    userId,
    actorId: p.actorId ?? null,
    type: p.type || "system",
    title: p.title,
    body: p.body,
    data: p.data,
  })));
}

// Credits are represented by the account's own transaction flow; keep this
// name for existing callers until every wallet event has a dedicated trigger.
export async function notifyAcoinReceived(_p: NotificationPayload): Promise<void> {}
