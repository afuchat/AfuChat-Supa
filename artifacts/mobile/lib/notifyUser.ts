/**
 * notifyUser.ts — STUB FILE
 * ─────────────────────────────────────────────────────────────────────────────
 * Push notification dispatch is now fully server-side:
 *   DB trigger → push-notification-trigger edge function → FCM HTTP v1
 *
 * All functions here are no-ops kept for import compatibility.
 * Do NOT add new calls to these functions. Remove existing calls gradually.
 */

// ── Type stubs ────────────────────────────────────────────────────────────────

export async function notifyNewMessage(_p: {
  recipientIds: string[];
  senderName: string;
  senderUserId: string;
  messageText: string;
  chatId: string;
  isGroup?: boolean;
  groupName?: string;
}): Promise<void> {}

export async function notifyPostLike(_p: {
  postOwnerId: string;
  likerName: string;
  likerUserId: string;
  postId: string;
  postTitle?: string;
}): Promise<void> {}

export async function notifyPostReply(_p: {
  postOwnerId: string;
  replierName: string;
  replierUserId: string;
  postId: string;
  replyText: string;
}): Promise<void> {}

export async function notifyNewFollower(_p: {
  followedUserId: string;
  followerName: string;
  followerUserId: string;
  followerHandle?: string;
  followerAvatar?: string;
}): Promise<void> {}

export async function notifyMention(_p: {
  mentionedUserId: string;
  mentionerName: string;
  mentionerUserId: string;
  postId?: string;
  chatId?: string;
  context?: string;
}): Promise<void> {}

export async function notifyGiftReceived(_p: {
  recipientId: string;
  senderName: string;
  senderUserId: string;
  giftName: string;
  chatId?: string;
}): Promise<void> {}

export async function notifyOrderShipped(_p: {
  buyerId: string;
  sellerName: string;
  orderId: string;
  productName?: string;
}): Promise<void> {}

export async function notifyOrderStatusChanged(_p: {
  buyerId: string;
  orderId: string;
  status: string;
  sellerName?: string;
}): Promise<void> {}

export async function notifyPaymentReceived(_p: {
  recipientId: string;
  senderName: string;
  amount: number;
  currency?: string;
}): Promise<void> {}

export async function notifyIncomingCall(_p: {
  recipientId: string;
  callerName: string;
  callerUserId: string;
  callId: string;
  callType?: string;
}): Promise<void> {}

export async function notifyMissedCall(_p: {
  recipientId: string;
  callerName: string;
  callerUserId: string;
}): Promise<void> {}

export async function notifySystemMessage(_p: {
  recipientIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<void> {}
