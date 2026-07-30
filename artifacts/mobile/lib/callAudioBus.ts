// ─── AfuChat Call Audio Bus ───────────────────────────────────────────────────
// Tiny module-level event bus that lets the call engine broadcast audio
// "takeover" / "release" events to any component that plays or records audio.
//
// USAGE
//   Emitter (callEngine.ts):
//     emitCallAudio("takeover");   // call started — pause everything
//     emitCallAudio("release");    // call ended   — audio may resume
//
//   Consumer (AudioPlayer, VideoFeed, chat recording, …):
//     useEffect(() => subscribeCallAudio((ev) => { if (ev === "takeover") ... }), []);
//
// On iOS / Android the OS audio session (set via expo-av AudioMode) already
// interrupts other audio automatically. This bus handles the explicit pausing
// for web and for active in-process consumers (e.g. a voice recording in progress).
// ─────────────────────────────────────────────────────────────────────────────

export type CallAudioEvent = "takeover" | "release";
export type CallAudioListener = (event: CallAudioEvent) => void;

const _listeners = new Set<CallAudioListener>();

/** Subscribe to call-audio events. Returns an unsubscribe function. */
export function subscribeCallAudio(fn: CallAudioListener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

/** Emit a call-audio event to all active subscribers. */
export function emitCallAudio(event: CallAudioEvent): void {
  _listeners.forEach((fn) => {
    try { fn(event); } catch {}
  });
}
