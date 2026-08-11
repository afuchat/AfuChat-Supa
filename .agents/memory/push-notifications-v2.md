---
name: Push Notifications v2
description: Architecture of the rebuilt push notification system (server-side only, FCM HTTP v1)
---

# Push Notifications v2

## Architecture

**Dispatch is server-side only.** DB triggers → `push-notification-trigger` edge function → FCM HTTP v1.
No client-side send calls. `notifyUser.ts` is a no-op stub for import compatibility.

## Token storage
- Column: `profiles.fcm_token` (+ `push_token_platform`, `push_token_updated_at`)
- Registration: `register-push-token` edge function called from `PushNotificationManager` component

## DB Triggers (pg_net)
Migration: `supabase/migrations/20260803_push_notifications_v2.sql`
- `messages` INSERT → trigger (skips `system`/`silent` message_type)
- `calls` INSERT → trigger (only fires when status IN ('ringing','initiated'))
- `notifications` INSERT → trigger (covers likes, follows, comments, mentions, payments)
All call `_private.call_push_trigger(jsonb)` → HTTP POST to `push-notification-trigger`

## Edge Functions
| Function | Purpose |
|---|---|
| `push-notification-trigger` | Main handler. Reads FCM token from profiles, checks notification_preferences (quiet hours, per-type toggles), sends via FCM HTTP v1 or Expo push |
| `register-push-token` | Auth user → upsert profiles.fcm_token |
| `admin-broadcast-push` | Sends to all/premium users. Requires ADMIN_BROADCAST_SECRET |
| `send-push-notification` | **Deprecated no-op** — returns 200 for stale callers |

## Required Supabase secrets (Edge Functions → Secrets)
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_KEY` (full service-account JSON)
- `ADMIN_BROADCAST_SECRET` (for admin broadcast only)

## Client files
- `lib/pushNotifications.ts` — permission request, FCM token, foreground handler, categories, listeners, badge
- `lib/notifyUser.ts` — no-op stubs (all functions exported but do nothing; server handles dispatch)
- `lib/notificationActions.ts` — action button handlers: chat_reply (sends message), mark_read (updates chat_members.last_read_at), confirm_delivery (updates orders)
- `components/PushNotificationManager.tsx` — root-mounted, calls setup on sign-in, re-registers every 10min on foreground

## Notification categories (action buttons, native only)
- `afuchat_message_reply`: Reply (inline text input) + Mark Read
- `afuchat_post_interact`: View
- `afuchat_order_update`: View Order + Confirm Delivery

## Android notification channels
messages, calls, social, marketplace, default

## Expo push fallback
Tokens starting with `ExponentPushToken[` are sent via Expo Push API (works in Expo Go dev builds)

## Expo Go development behavior
Android Expo Go on SDK 55 cannot receive remote FCM/Expo push tokens. In Expo Go, the client attempts Expo token registration where the installed client supports it; otherwise an Expo-Go-only Supabase Realtime bridge schedules local notifications for messages, calls, social notifications, and order events while the app is open. Native development/standalone builds continue using server-side FCM/Expo delivery.

**Why:** The previous system mixed client-side dispatch (`notifyUser.ts` calling edge functions) with server triggers, causing duplicate sends and broken state when sender app was closed.
