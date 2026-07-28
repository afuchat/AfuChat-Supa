// ─── Call Push Bridge ─────────────────────────────────────────────────────────
// Tiny global event bridge that lets the push notification handler (which runs
// outside React) deliver an incoming_call event to the CallContext (which lives
// inside React). This avoids a circular import between pushNotifications.ts and
// CallContext.tsx.
//
// Usage:
//   • pushNotifications.ts  → emitPushIncomingCall(notice)
//   • CallContext.tsx        → listenPushIncomingCall(handler) in useEffect
// ─────────────────────────────────────────────────────────────────────────────

import type { IncomingCallNotice } from "@/lib/callEngine";

type Handler = (notice: IncomingCallNotice) => void;
const _handlers = new Set<Handler>();

/** Called by pushNotifications.ts when an incoming_call notification is tapped. */
export function emitPushIncomingCall(notice: IncomingCallNotice): void {
  _handlers.forEach((h) => { try { h(notice); } catch {} });
}

/** Called by CallContext to subscribe. Returns unsubscribe fn. */
export function listenPushIncomingCall(handler: Handler): () => void {
  _handlers.add(handler);
  return () => _handlers.delete(handler);
}
