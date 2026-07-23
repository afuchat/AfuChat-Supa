import { supabase } from "@/lib/supabase";
import { NOTIF_CATEGORY } from "@/lib/pushNotifications";

// Push notifications are dispatched via Supabase Edge Functions only.
// The mobile client calls the `send-push-notification` edge function directly
// for immediate delivery. Supabase Database Webhooks call the
// `push-notification-trigger` edge function for true server-side dispatch
// (fires even when the sender's app is closed).

type NotifyParams = {
  userId: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
  categoryIdentifier?: string;
  notificationType?: string;
  actorId?: string;
  actorName?: string;
  actorHandle?: string;
  actorAvatar?: string;
  postId?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
};

async function callNotify(params: NotifyParams) {
  const { userId, title, body, data, categoryIdentifier, notificationType, actorId, actorName, actorHandle, actorAvatar, postId, referenceId, referenceType } = params;

  // ── Client-side edge function call for immediate delivery ───────────────────
  // Runs in the background — does not block the caller.
  if (title && body) {
    supabase.functions
      .invoke("send-push-notification", {
        body: { userId, title, body, data: data || {}, categoryIdentifier },
      })
      .catch((err: unknown) =>
        console.warn("[Notify] Edge function call failed:", err),
      );
  }

  // ── Upsert notification row with full actor info ─────────────────────────────
  // DB triggers insert notifications with actor_id only (no name/avatar).
  // We insert/upsert here so the system chat always shows the real actor name.
  // Uses a short-window update strategy: update any matching row created in the
  // last 5s, OR insert a new row if none exists yet.
  if (notificationType && userId) {
    const notifPayload: Record<string, any> = {
      user_id: userId,
      type: notificationType,
      title: title || "",
      body: body || "",
    };
    if (actorId) notifPayload.actor_id = actorId;
    if (actorName) notifPayload.actor_name = actorName;
    if (actorHandle) notifPayload.actor_handle = actorHandle;
    if (actorAvatar) notifPayload.actor_avatar = actorAvatar;
    if (postId) { notifPayload.entity_id = postId; notifPayload.entity_type = "post"; }
    else if (referenceId) { notifPayload.entity_id = referenceId; notifPayload.entity_type = referenceType || ""; }
    if (data) notifPayload.data = data;

    // Try to backfill actor name on a row the DB trigger may have just created
    if (actorId && actorName) {
      const since = new Date(Date.now() - 8_000).toISOString();
      supabase
        .from("notifications")
        .update({ actor_name: actorName, ...(actorHandle ? { actor_handle: actorHandle } : {}), ...(actorAvatar ? { actor_avatar: actorAvatar } : {}) })
        .eq("user_id", userId)
        .eq("type", notificationType)
        .eq("actor_id", actorId)
        .is("actor_name", null)
        .gte("created_at", since)
        .then(() => {}, () => {});
    }

    // Also insert our own row in case the DB trigger didn't fire
    supabase
      .from("notifications")
      .insert(notifPayload)
      .then(() => {}, () => {});
  }
}

// ─── Social Notifications ────────────────────────────────────────────

export async function notifyNewMessage(params: {
  recipientIds: string[];
  senderName: string;
  senderUserId: string;
  messageText: string;
  chatId: string;
  isGroup?: boolean;
  groupName?: string;
}) {
  const title = params.isGroup
    ? `${params.senderName} in ${params.groupName || "Group"}`
    : params.senderName;
  const body = params.messageText || "Sent an attachment";
  const short = body.length > 100 ? body.substring(0, 97) + "..." : body;

  for (const userId of params.recipientIds) {
    callNotify({
      userId,
      title,
      body: short,
      categoryIdentifier: NOTIF_CATEGORY.MESSAGE_REPLY,
      data: {
        chatId: params.chatId,
        type: "message",
        actorId: params.senderUserId,
        notifType: "new_message",
      },
      notificationType: "new_message",
      actorId: params.senderUserId,
      referenceId: params.chatId,
      referenceType: "chat",
    });
  }
}

export async function notifyNewFollow(params: {
  targetUserId: string;
  followerName: string;
  followerUserId: string;
  followerHandle?: string;
  followerAvatar?: string;
}) {
  callNotify({
    userId: params.targetUserId,
    title: "New Follower",
    body: `${params.followerName} started following you`,
    categoryIdentifier: NOTIF_CATEGORY.NEW_FOLLOWER,
    data: {
      type: "follow",
      actorId: params.followerUserId,
      notifType: "new_follower",
    },
    notificationType: "new_follower",
    actorId: params.followerUserId,
    actorName: params.followerName,
    actorHandle: params.followerHandle,
    actorAvatar: params.followerAvatar,
  });
}

export async function notifyPostLike(params: {
  postAuthorId: string;
  likerName: string;
  likerUserId: string;
  postId: string;
}) {
  callNotify({
    userId: params.postAuthorId,
    title: "Post Liked",
    body: `${params.likerName} liked your post`,
    categoryIdentifier: NOTIF_CATEGORY.POST_INTERACT,
    data: {
      postId: params.postId,
      type: "like",
      actorId: params.likerUserId,
      notifType: "new_like",
    },
    notificationType: "new_like",
    actorId: params.likerUserId,
    actorName: params.likerName,
    postId: params.postId,
  });
}

export async function notifyPostReply(params: {
  postAuthorId: string;
  replierName: string;
  replierUserId: string;
  postId: string;
  replyPreview?: string;
}) {
  const preview = (params.replyPreview || "").trim();
  const body = preview.length > 100
    ? preview.substring(0, 97) + "..."
    : preview || "Replied to your post";
  callNotify({
    userId: params.postAuthorId,
    title: params.replierName,
    body,
    categoryIdentifier: NOTIF_CATEGORY.POST_INTERACT,
    data: {
      postId: params.postId,
      type: "reply",
      actorId: params.replierUserId,
      notifType: "new_reply",
    },
    notificationType: "new_reply",
    actorId: params.replierUserId,
    actorName: params.replierName,
    postId: params.postId,
  });
}

export async function notifyGiftReceived(params: {
  recipientId: string;
  senderName: string;
  senderUserId: string;
  giftName: string;
}) {
  callNotify({
    userId: params.recipientId,
    title: "Gift Received! 🎁",
    body: `${params.senderName} sent you ${params.giftName}`,
    categoryIdentifier: NOTIF_CATEGORY.GIFT_RECEIVED,
    data: {
      type: "gift",
      actorId: params.senderUserId,
      notifType: "gift",
    },
    notificationType: "gift",
    actorId: params.senderUserId,
    actorName: params.senderName,
  });
}

export async function notifyMention(params: {
  targetUserId: string;
  mentionedBy: string;
  mentionedByUserId: string;
  postId: string;
  preview: string;
}) {
  callNotify({
    userId: params.targetUserId,
    title: `${params.mentionedBy} mentioned you`,
    body: params.preview.substring(0, 100),
    categoryIdentifier: NOTIF_CATEGORY.MENTION,
    data: {
      postId: params.postId,
      type: "mention",
      actorId: params.mentionedByUserId,
      notifType: "new_mention",
    },
    notificationType: "new_mention",
    actorId: params.mentionedByUserId,
    actorName: params.mentionedBy,
    postId: params.postId,
  });
}

// ─── Marketplace / Shop Notifications ────────────────────────────────

export async function notifyOrderPlaced(params: {
  sellerId: string;
  buyerName: string;
  buyerUserId: string;
  orderId: string;
  totalAcoin: number;
  itemCount: number;
}) {
  callNotify({
    userId: params.sellerId,
    title: "New Order Received! 🛍️",
    body: `${params.buyerName} placed an order for ${params.itemCount} item${params.itemCount !== 1 ? "s" : ""} — ${params.totalAcoin} AC in escrow`,
    categoryIdentifier: NOTIF_CATEGORY.ORDER_UPDATE,
    data: {
      type: "order",
      orderId: params.orderId,
      actorId: params.buyerUserId,
      notifType: "order_placed",
      url: `/shop/order/${params.orderId}`,
    },
    notificationType: "order_placed",
    actorId: params.buyerUserId,
    actorName: params.buyerName,
    referenceId: params.orderId,
    referenceType: "order",
  });
}

export async function notifyOrderShipped(params: {
  buyerId: string;
  sellerName: string;
  sellerUserId: string;
  orderId: string;
}) {
  callNotify({
    userId: params.buyerId,
    title: "Your Order Has Shipped! 📦",
    body: `${params.sellerName} has shipped your order. Confirm delivery to release payment.`,
    categoryIdentifier: NOTIF_CATEGORY.ORDER_SHIPPED,
    data: {
      type: "order",
      orderId: params.orderId,
      actorId: params.sellerUserId,
      notifType: "order_shipped",
      url: `/shop/order/${params.orderId}`,
    },
    notificationType: "order_shipped",
    actorId: params.sellerUserId,
    actorName: params.sellerName,
    referenceId: params.orderId,
    referenceType: "order",
  });
}

export async function notifyDeliveryConfirmed(params: {
  sellerId: string;
  buyerName: string;
  buyerUserId: string;
  orderId: string;
  amountReleased: number;
}) {
  callNotify({
    userId: params.sellerId,
    title: "Payment Released! 💰",
    body: `${params.buyerName} confirmed delivery. ${params.amountReleased} AC has been credited to your wallet.`,
    categoryIdentifier: NOTIF_CATEGORY.ORDER_UPDATE,
    data: {
      type: "escrow",
      orderId: params.orderId,
      actorId: params.buyerUserId,
      notifType: "escrow_released",
      url: `/shop/order/${params.orderId}`,
    },
    notificationType: "escrow_released",
    actorId: params.buyerUserId,
    actorName: params.buyerName,
    referenceId: params.orderId,
    referenceType: "order",
  });
}

export async function notifyDisputeRaised(params: {
  sellerId: string;
  buyerName: string;
  buyerUserId: string;
  orderId: string;
}) {
  callNotify({
    userId: params.sellerId,
    title: "Order Dispute Opened ⚠️",
    body: `${params.buyerName} raised a dispute on their order. Our team is reviewing it.`,
    categoryIdentifier: NOTIF_CATEGORY.ORDER_UPDATE,
    data: {
      type: "order",
      orderId: params.orderId,
      actorId: params.buyerUserId,
      notifType: "dispute_raised",
      url: `/shop/order/${params.orderId}`,
    },
    notificationType: "dispute_raised",
    actorId: params.buyerUserId,
    actorName: params.buyerName,
    referenceId: params.orderId,
    referenceType: "order",
  });
}

export async function notifyRefundIssued(params: {
  buyerId: string;
  orderId: string;
  amountRefunded: number;
}) {
  callNotify({
    userId: params.buyerId,
    title: "Refund Issued ✅",
    body: `Your refund of ${params.amountRefunded} AC has been returned to your AfuPay wallet.`,
    categoryIdentifier: NOTIF_CATEGORY.ORDER_UPDATE,
    data: {
      type: "payment",
      orderId: params.orderId,
      notifType: "refund_issued",
      url: `/shop/order/${params.orderId}`,
    },
    notificationType: "refund_issued",
    referenceId: params.orderId,
    referenceType: "order",
  });
}

export async function notifyOrderReview(params: {
  sellerId: string;
  buyerName: string;
  buyerUserId: string;
  orderId: string;
  rating: number;
}) {
  callNotify({
    userId: params.sellerId,
    title: `New Review — ${params.rating}⭐`,
    body: `${params.buyerName} left a review for your shop.`,
    categoryIdentifier: NOTIF_CATEGORY.ORDER_UPDATE,
    data: {
      type: "order",
      orderId: params.orderId,
      actorId: params.buyerUserId,
      notifType: "shop_review",
      url: `/shop/order/${params.orderId}`,
    },
    notificationType: "shop_review",
    actorId: params.buyerUserId,
    actorName: params.buyerName,
    referenceId: params.orderId,
    referenceType: "order",
  });
}

// ─── ACoins / Payment Notifications ──────────────────────────────────

export async function notifyAcoinReceived(params: {
  userId: string;
  amount: number;
  reason: string;
  referenceId?: string;
  referenceType?: string;
}) {
  callNotify({
    userId: params.userId,
    title: `+${params.amount} AC Received 💰`,
    body: params.reason,
    data: { type: "payment", notifType: "acoin_received", url: "/me" },
    notificationType: "acoin_received",
    referenceId: params.referenceId || null,
    referenceType: params.referenceType || null,
  });
}

export async function notifyAcoinSent(params: {
  userId: string;
  amount: number;
  reason: string;
}) {
  callNotify({
    userId: params.userId,
    title: `${params.amount} AC Sent`,
    body: params.reason,
    data: { type: "payment", notifType: "acoin_sent", url: "/me" },
    notificationType: "acoin_sent",
  });
}

export async function notifySubscriptionActivated(params: {
  userId: string;
  planName: string;
}) {
  callNotify({
    userId: params.userId,
    title: "Subscription Active! ⭐",
    body: `Your ${params.planName} subscription is now active. Enjoy premium features!`,
    data: { type: "payment", notifType: "subscription_activated", url: "/monetize" },
    notificationType: "subscription_activated",
  });
}

// ─── Channel / Social Group Notifications ────────────────────────────

export async function notifyChannelPost(params: {
  subscriberIds: string[];
  channelName: string;
  channelId: string;
  postPreview: string;
}) {
  const body = params.postPreview.length > 100
    ? params.postPreview.substring(0, 97) + "..."
    : params.postPreview;
  for (const userId of params.subscriberIds) {
    callNotify({
      userId,
      title: params.channelName,
      body,
      data: {
        type: "channel",
        channelId: params.channelId,
        notifType: "channel_post",
        url: `/channel/${params.channelId}`,
      },
      notificationType: "channel_post",
      referenceId: params.channelId,
      referenceType: "channel",
    });
  }
}

export async function notifyLiveStream(params: {
  followerIds: string[];
  streamerName: string;
  streamerId: string;
  channelId: string;
}) {
  for (const userId of params.followerIds) {
    callNotify({
      userId,
      title: `${params.streamerName} is live! 🔴`,
      body: "Tap to join the stream",
      data: {
        type: "live",
        actorId: params.streamerId,
        notifType: "live_started",
        url: `/channel/${params.channelId}`,
      },
      notificationType: "live_started",
      actorId: params.streamerId,
      actorName: params.streamerName,
      referenceId: params.channelId,
      referenceType: "channel",
    });
  }
}

// ─── System / Admin Notifications ────────────────────────────────────

export async function notifySystemMessage(params: {
  userId: string;
  title: string;
  body: string;
  url?: string;
}) {
  callNotify({
    userId: params.userId,
    title: params.title,
    body: params.body,
    data: { type: "system", notifType: "system", url: params.url || "/" },
    notificationType: "system",
  });
}

export async function notifySellerApplicationStatus(params: {
  userId: string;
  approved: boolean;
}) {
  callNotify({
    userId: params.userId,
    title: params.approved ? "Seller Application Approved! 🎉" : "Seller Application Update",
    body: params.approved
      ? "Your seller application has been approved. You can now list products on AfuMarket!"
      : "Your seller application needs more information. Please check your email.",
    data: {
      type: "system",
      notifType: params.approved ? "seller_approved" : "seller_rejected",
      url: params.approved ? "/shop/manage" : "/shop/apply",
    },
    notificationType: params.approved ? "seller_approved" : "seller_rejected",
  });
}

export async function notifyVerificationStatus(params: {
  userId: string;
  approved: boolean;
  profileType: string;
}) {
  callNotify({
    userId: params.userId,
    title: params.approved ? `${params.profileType} Verification Approved ✅` : "Verification Update",
    body: params.approved
      ? "Your account has been verified. A badge is now visible on your profile."
      : "Your verification request needs additional information.",
    data: {
      type: "system",
      notifType: params.approved ? "verification_approved" : "verification_update",
      url: "/me",
    },
    notificationType: params.approved ? "verification_approved" : "verification_update",
  });
}

// ─── Missed Call Notification ─────────────────────────────────────────────────
// Sent by the CALLER's device when the callee doesn't answer within the ring
// timeout (30 s). The notification appears in the callee's system tray so
// they can see who called. Tapping it navigates to the call history page.

export async function notifyMissedCall(params: {
  calleeId: string;
  callerId: string;
  callId: string;
  callType: "voice" | "video";
  callerName: string;
}) {
  const typeLabel = params.callType === "video" ? "Video" : "Voice";
  callNotify({
    userId: params.calleeId,
    title: "Missed Call",
    body: `You missed a ${typeLabel} call from ${params.callerName}`,
    data: {
      type: "missed_call",
      callId: params.callId,
      callType: params.callType,
      actorId: params.callerId,
      callerName: params.callerName,
      notifType: "missed_call",
      url: "/call-history",
    },
    notificationType: "missed_call",
    actorId: params.callerId,
    actorName: params.callerName,
    referenceId: params.callId,
    referenceType: "call",
  });
}
