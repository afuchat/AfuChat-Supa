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
//
// These functions are intentionally no-ops. The app historically used several
// slightly different payload names at different call sites, so keep this
// compatibility surface permissive while delivery remains server-side.
type NotificationPayload = Record<string, unknown>;

export async function notifyNewMessage(_p: NotificationPayload): Promise<void> {}

export async function notifyPostLike(_p: NotificationPayload): Promise<void> {}

export async function notifyPostReply(_p: NotificationPayload): Promise<void> {}

export async function notifyNewFollower(_p: NotificationPayload): Promise<void> {}

/** Backward-compatible name used by older feed components. */
export const notifyNewFollow = notifyNewFollower;

export async function notifyMention(_p: NotificationPayload): Promise<void> {}

export async function notifyGiftReceived(_p: NotificationPayload): Promise<void> {}

export async function notifyOrderShipped(_p: NotificationPayload): Promise<void> {}

export async function notifyOrderStatusChanged(_p: NotificationPayload): Promise<void> {}

export async function notifyPaymentReceived(_p: NotificationPayload): Promise<void> {}

export async function notifyIncomingCall(_p: NotificationPayload): Promise<void> {}

export async function notifyMissedCall(_p: NotificationPayload): Promise<void> {}

export async function notifySystemMessage(_p: NotificationPayload): Promise<void> {}

// Legacy commerce notification names retained until their callers are
// migrated to the database-triggered notification pipeline.
export async function notifyOrderPlaced(_p: NotificationPayload): Promise<void> {}
export async function notifyDeliveryConfirmed(_p: NotificationPayload): Promise<void> {}
export async function notifyDisputeRaised(_p: NotificationPayload): Promise<void> {}
export async function notifyRefundIssued(_p: NotificationPayload): Promise<void> {}
export async function notifyAcoinReceived(_p: NotificationPayload): Promise<void> {}
export async function notifyOrderReview(_p: NotificationPayload): Promise<void> {}
