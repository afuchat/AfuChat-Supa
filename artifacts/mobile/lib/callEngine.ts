// ─── AfuChat Call Engine ──────────────────────────────────────────────────────
// Manages the full lifecycle of a P2P voice call.
//
// STACK
//   • react-native-webrtc (Android/iOS) or browser-native WebRTC (web)
//   • Supabase Realtime Broadcast — signaling (offer/answer/ICE, no DB needed)
//   • expo-av AudioMode    — speaker/earpiece routing + silent-mode overrides
//   • expo-keep-awake      — prevents screen dimming during active call
//
// SIGNALING PROTOCOL (race-free, no DB dependency)
//   1. Caller subscribes to call:${callId} channel
//   2. Caller notifies callee via user-call:${calleeId} broadcast
//   3. Callee receives broadcast → status: incoming_ringing (cancel-watcher subscribed)
//   4. Callee accepts → cancel-watcher replaced by full signaling → broadcasts `ringing`
//   5. Caller receives `ringing` → creates offer SDP → broadcasts `offer`
//   6. Callee receives `offer` → creates answer SDP → broadcasts `answer`
//   7. Caller receives `answer` → setRemoteDescription
//   8. Both trickle ICE candidates via `ice_candidate` events
//   9. ICE checks complete → P2P audio established
//
// PLATFORM SUPPORT
//   • Android / iOS: react-native-webrtc (NativeModules.WebRTCModule)
//   • Web: browser-native RTCPeerConnection — no package required
//   • Expo Go (no native module): calling disabled gracefully
// ─────────────────────────────────────────────────────────────────────────────

import { Platform, NativeModules, TurboModuleRegistry } from "react-native";
import { supabase } from "@/lib/supabase";
import { saveLocalCall } from "@/lib/storage/localCallHistory";
import { emitCallAudio } from "@/lib/callAudioBus";
import { isExpoGo } from "@/lib/expoEnvironment";

// ─── WebRTC bridge: native (react-native-webrtc) vs web (browser APIs) ────────
// On Android/iOS we use react-native-webrtc. On web, every modern browser
// exposes RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, and
// navigator.mediaDevices natively — no package needed, calling works on web too.

interface _RTCBridge {
  RTCPeerConnection:    any;
  RTCSessionDescription: any;
  RTCIceCandidate:      any;
  mediaDevices: { getUserMedia: (c: any) => Promise<any> };
}

// ─── WebRTC bridge: lazy detection ────────────────────────────────────────────
// IMPORTANT: Detection is intentionally deferred to the first call attempt, NOT
// run at module-eval time. callEngine.ts is imported early (3rd import in
// _layout.tsx) when the React Native bridge / TurboModuleRegistry may not yet
// be fully initialized. Evaluating TurboModuleRegistry.get("WebRTCModule") at
// module-load time can return null even when the native module IS present,
// permanently setting WEBRTC_AVAILABLE=false and blocking all voice calls.
// By detecting lazily (on the first startCall/acceptCall), the bridge is
// always ready and the lookup succeeds reliably.

let _rtcBridge: _RTCBridge | null | undefined = undefined; // undefined = not yet detected / not yet confirmed null
let _rtcNullCount = 0; // how many consecutive failed detections (used to give up on Expo Go)

function _detectRTC(): _RTCBridge | null {
  if (Platform.OS === "web") {
    // Browser WebRTC — available in Chrome, Firefox, Safari, Edge
    const g = globalThis as any;
    if (typeof g.RTCPeerConnection === "undefined") return null; // very old browser
    if (typeof g.navigator?.mediaDevices?.getUserMedia !== "function") return null;
    return {
      RTCPeerConnection:     g.RTCPeerConnection,
      RTCSessionDescription: g.RTCSessionDescription,
      RTCIceCandidate:       g.RTCIceCandidate,
      mediaDevices: {
        getUserMedia: (c: any) => {
          if (!navigator.mediaDevices?.getUserMedia) {
            return Promise.reject(new Error("getUserMedia not supported in this browser"));
          }
          return navigator.mediaDevices.getUserMedia(c);
        },
      },
    } satisfies _RTCBridge;
  }

  // Expo Go does not bundle react-native-webrtc. Avoid requiring it at all:
  // importing the package emits a native-module error and an event-target-shim
  // resolution warning before its failure can be caught.
  if (isExpoGo()) return null;

  // Native (Android / iOS): react-native-webrtc.
  //
  // react-native-webrtc v124 checks NativeModules.WebRTCModule at module-eval
  // time and throws if null. In New Architecture, native modules live in
  // TurboModuleRegistry; NativeModules.WebRTCModule is null even when the
  // module IS present. We inject the TurboModule entry into NativeModules
  // BEFORE requiring so the library's null-guard passes.
  //
  // If both NativeModules and TurboModuleRegistry have no entry, the module is
  // genuinely absent (Expo Go) and we return null cleanly.
  try {
    if (NativeModules.WebRTCModule == null) {
      // New Architecture: modules live in TurboModuleRegistry, not NativeModules.
      // Try to inject it so react-native-webrtc's module-eval null-guard passes.
      // If TurboModuleRegistry also has nothing, we still attempt require() —
      // on some OEM builds the legacy-interop layer exposes the module via require
      // but NOT via TurboModuleRegistry.get(). Never bail here; let the require
      // outcome (or the RTCPeerConnection null-check) be the real gate.
      let turbo: any = null;
      try { turbo = TurboModuleRegistry?.get?.("WebRTCModule") ?? null; } catch {}
      if (turbo == null) {
        try { turbo = TurboModuleRegistry?.get?.("WebRTC") ?? null; } catch {}
      }
      if (turbo != null) {
        try { (NativeModules as any).WebRTCModule = turbo; } catch {}
      }
    }
    const rn = require("react-native-webrtc") as typeof import("react-native-webrtc");
    if (!rn?.RTCPeerConnection) return null;
    return {
      RTCPeerConnection:     rn.RTCPeerConnection,
      RTCSessionDescription: rn.RTCSessionDescription,
      RTCIceCandidate:       rn.RTCIceCandidate,
      mediaDevices:          rn.mediaDevices as any,
    } satisfies _RTCBridge;
  } catch (e) {
    console.warn("[CallEngine] react-native-webrtc unavailable:", e);
    return null;
  }
}

/**
 * Returns the RTC bridge, detecting lazily on first call.
 *
 * IMPORTANT — null is NOT permanently cached on the first failed probe.
 * CallContext probes on mount via getWebRTCAvailable(). On production builds
 * the first probe can fire before TurboModules finish registering and return
 * null even though react-native-webrtc IS compiled in. If we cached that null
 * forever, every subsequent startCall would throw "WEBRTC_UNAVAILABLE".
 *
 * Strategy: only cache success permanently. Cache null only after 3+
 * consecutive failures — by then we're genuinely on Expo Go or a device
 * that truly has no WebRTC support.
 */
function _getRTC(): _RTCBridge | null {
  if (_rtcBridge !== undefined) return _rtcBridge; // cached success → fast path
  const result = _detectRTC();
  if (result !== null) {
    _rtcBridge = result;       // success — cache permanently
    _rtcNullCount = 0;
  } else {
    _rtcNullCount++;
    if (_rtcNullCount >= 3) _rtcBridge = null; // give up after 3 failures (Expo Go / no module)
  }
  return result;
}

function _requireRTC(): _RTCBridge {
  const rtc = _getRTC();
  if (!rtc) throw new Error("WEBRTC_UNAVAILABLE");
  return rtc;
}

function _newRTCSessionDescription(init: unknown): any {
  const Constructor = _requireRTC().RTCSessionDescription as any;
  return new Constructor(init);
}

function _newRTCIceCandidate(init: unknown): any {
  const Constructor = _requireRTC().RTCIceCandidate as any;
  return new Constructor(init);
}

/**
 * Returns true when WebRTC is available on this device/build.
 * Exported so CallContext can check after the native bridge is ready.
 * Always call this after app mount — not at module-eval / import time.
 */
export function getWebRTCAvailable(): boolean {
  return _getRTC() !== null;
}

// ─── Lazy-load expo-av + expo-keep-awake ─────────────────────────────────────

const _AV: typeof import("expo-av") | null = (() => {
  // expo-av is a native module — only available on Android/iOS.
  // Do NOT gate on NativeModules.ExponentAV: in Expo SDK 55 + New Architecture
  // production builds, expo-av uses TurboModules/JSI and does NOT register under
  // NativeModules, so that check always returns null and silently disables all audio.
  if (Platform.OS === "web" || isExpoGo()) return null;
  try { return require("expo-av"); } catch { return null; }
})();

const _KA: typeof import("expo-keep-awake") | null = (() => {
  try { return require("expo-keep-awake"); } catch { return null; }
})();

// ─── ICE servers ──────────────────────────────────────────────────────────────
// STUN-only connections fail on symmetric NAT (most mobile networks). TURN
// servers relay traffic when a direct P2P path can't be established. The open
// Metered relay is used here as a reliable free baseline; replace with your own
// Cloudflare / Coturn / Metered credentials for higher-volume production use.

const _TURN_URL   = process.env.EXPO_PUBLIC_TURN_URL   ?? "openrelay.metered.ca";
const _TURN_USER  = process.env.EXPO_PUBLIC_TURN_USER  ?? "openrelayproject";
const _TURN_CRED  = process.env.EXPO_PUBLIC_TURN_CRED  ?? "openrelayproject";

const ICE_SERVERS = [
  // STUN — fast path when both peers have open NAT
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
  // TURN — relay fallback for symmetric NAT / restrictive corporate / cellular
  { urls: `turn:${_TURN_URL}:80`,                  username: _TURN_USER, credential: _TURN_CRED },
  { urls: `turn:${_TURN_URL}:443`,                 username: _TURN_USER, credential: _TURN_CRED },
  { urls: `turn:${_TURN_URL}:443?transport=tcp`,   username: _TURN_USER, credential: _TURN_CRED },
  { urls: `turn:${_TURN_URL}:80?transport=tcp`,    username: _TURN_USER, credential: _TURN_CRED },
];

// ─── Ring timeout: auto-hangup if callee doesn't answer ──────────────────────
export const RING_TIMEOUT_MS       = 30_000; // 30 s ringing before declaring missed
const CONNECT_TIMEOUT_MS           = 20_000; // 20 s for ICE after SDP exchange
const DISCONNECT_WATCHDOG_MS       = 10_000; // escalate ICE "disconnected" → lost after 10 s
const HEARTBEAT_INTERVAL_MS        =  5_000; // send & check heartbeat every 5 s
const HEARTBEAT_TIMEOUT_MS         = 15_000; // 3 missed beats → assume peer force-quit

// ─── Types ───────────────────────────────────────────────────────────────────

export type CallStatus =
  | "idle"
  | "outgoing_ringing"   // we placed the call, waiting for callee
  | "incoming_ringing"   // callee side — waiting for us to accept
  | "connecting"         // SDP exchanged, establishing ICE
  | "active"             // audio flowing
  | "ended"              // brief terminal state before reset
  | "unreachable"        // ring timeout fired — callee was offline/unreachable
  | "connection_lost";   // peer force-quit or network dropped mid-call

export interface CallInfo {
  callId: string;
  callerId: string;
  calleeId: string;
  callerName: string;
  callerAvatar: string | null;
  calleeName: string;
  calleeAvatar: string | null;
  chatId: string | null;
  startedAt: number;     // Date.now()
  answeredAt: number | null;
  isCaller: boolean;
}

export interface IncomingCallNotice {
  callId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string | null;
  chatId: string | null;
}

export type CallEngineEvent =
  | { type: "status"; status: CallStatus; info: CallInfo | null }
  | { type: "incoming"; notice: IncomingCallNotice }
  | { type: "ice_state"; state: string }
  | { type: "error"; message: string }
  | { type: "busy" };   // remote end sent busy signal (callee was already in a call)

type Listener = (event: CallEngineEvent) => void;

// ─── Module-level singleton state ────────────────────────────────────────────

let _status: CallStatus = "idle";
let _info: CallInfo | null = null;
let _pc: any | null = null;                    // RTCPeerConnection
let _localStream: any | null = null;           // MediaStream
let _signalingCh: any | null = null;           // call:${callId} channel
let _cancelCh: any | null = null;              // cancel-watcher (incoming_ringing only)
let _inboxCh: any | null = null;               // user-call:${userId} channel
let _currentUserId: string | null = null;
let _pendingCandidates: any[] = [];            // queued before remote desc ready
let _remoteDescSet = false;
let _isMuted = false;
let _isSpeaker = false;
let _ringTimer: ReturnType<typeof setTimeout> | null = null;
let _connectTimer: ReturnType<typeof setTimeout> | null = null;
let _disconnectWatchdog: ReturnType<typeof setTimeout> | null = null;
let _heartbeatSendTimer: ReturnType<typeof setInterval> | null = null;
let _heartbeatWatchdogTimer: ReturnType<typeof setInterval> | null = null;
let _lastHeartbeatAt = 0;
let _listeners = new Set<Listener>();
let _keepAwakeTag = "afucall";
let _keepAwakeActive = false;

// ─── Event bus ───────────────────────────────────────────────────────────────

export function addCallEngineListener(fn: Listener): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function emit(event: CallEngineEvent) {
  _listeners.forEach((fn) => {
    try { fn(event); } catch {}
  });
}

function setStatus(s: CallStatus) {
  _status = s;
  emit({ type: "status", status: s, info: _info });
  // Notify audio consumers: pause everything when a call occupies the mic/speaker,
  // release when the call ends so other audio can resume.
  if (s === "outgoing_ringing" || s === "incoming_ringing") {
    emitCallAudio("takeover");
  } else if (s === "idle") {
    emitCallAudio("release");
  }
}

// ─── Init: subscribe to user-call inbox for foreground incoming calls ─────────

export function initCallEngine(userId: string) {
  if (_currentUserId === userId) return; // already initialised for this user
  // If there is an active call for a previous user, tear it down before
  // reinitialising — a stale call must never survive an account switch.
  if (_currentUserId !== null && _status !== "idle") {
    _doHangup("idle");
  }
  _currentUserId = userId;

  // Tear down any previous inbox channel
  if (_inboxCh) {
    supabase.removeChannel(_inboxCh).catch(() => {});
    _inboxCh = null;
  }

  _inboxCh = supabase
    .channel(`user-call:${userId}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "incoming_call" }, ({ payload }: any) => {
      if (!payload?.callId || !payload?.callerId) return;

      // If we're already in a call (or handling another incoming), send busy
      if (_status !== "idle") {
        _sendBusy(payload.callId, payload.callerId);
        return;
      }

      const notice: IncomingCallNotice = {
        callId: payload.callId,
        callerId: payload.callerId,
        callerName: payload.callerName ?? "Unknown",
        callerAvatar: payload.callerAvatar ?? null,
        chatId: payload.chatId ?? null,
      };

      // Transition to incoming_ringing BEFORE emitting the incoming event so
      // that any secondary incoming_call arriving in the same microtask tick
      // sees _status !== "idle" and gets a busy reply.
      setStatus("incoming_ringing");

      // Subscribe a lightweight cancel-watcher so we can detect if the caller
      // hangs up / cancels before the local user taps Accept.
      _subscribeCancelWatcher(notice.callId);

      // Tell the UI an incoming call has arrived
      emit({ type: "incoming", notice });
    })
    .subscribe();
}

export function teardownCallEngine() {
  _currentUserId = null;
  if (_inboxCh) {
    supabase.removeChannel(_inboxCh).catch(() => {});
    _inboxCh = null;
  }
  _doHangup("idle");
}

// ─── Start outgoing call ──────────────────────────────────────────────────────

export async function startCall(params: {
  callId: string;
  calleeId: string;
  calleeName: string;
  calleeAvatar: string | null;
  myId: string;
  myName: string;
  myAvatar: string | null;
  chatId: string | null;
}): Promise<void> {
  if (!_getRTC()) throw new Error("WEBRTC_UNAVAILABLE");
  if (_status !== "idle") throw new Error("Already in a call");

  const { callId, calleeId, calleeName, calleeAvatar, myId, myName, myAvatar, chatId } = params;

  _info = {
    callId,
    callerId: myId,
    calleeId,
    callerName: myName,
    callerAvatar: myAvatar,
    calleeName,
    calleeAvatar,
    chatId,
    startedAt: Date.now(),
    answeredAt: null,
    isCaller: true,
  };

  setStatus("outgoing_ringing");
  _activateAudioMode(false);
  _activateKeepAwake();

  // Subscribe to signaling channel FIRST so we don't miss the callee's `ringing`
  await _subscribeSignaling(callId, true);

  // Broadcast to callee's inbox (foreground fast-path).
  // IMPORTANT: we must AWAIT the send before removing the channel, otherwise
  // the Realtime WebSocket may be torn down before the broadcast is flushed,
  // causing the callee to silently never receive the incoming_call event.
  const calleeInbox = supabase.channel(`user-call:${calleeId}`, {
    config: { broadcast: { self: true } },
  });

  await new Promise<void>((resolve) => {
    const sub = calleeInbox.subscribe((status: string) => {
      if (status === "SUBSCRIBED") resolve();
    });
    // Safety timeout — if SUBSCRIBED never fires (e.g. no Supabase connection),
    // unblock startCall so the ring timer and UI still work.
    setTimeout(resolve, 6_000);
    void sub;
  });

  // Await the send so the broadcast is flushed before we destroy the channel.
  await calleeInbox.send({
    type: "broadcast",
    event: "incoming_call",
    payload: {
      callId,
      callerId: myId,
      callerName: myName,
      callerAvatar: myAvatar,
      chatId,
    },
  });

  supabase.removeChannel(calleeInbox).catch(() => {});

  // Persist call history and state without blocking call setup.
  supabase.from("calls").insert({
    id: callId,
    room_id: callId,
    caller_id: myId,
    callee_id: calleeId,
    call_type: "voice",
    status: "ringing",
    started_at: new Date().toISOString(),
    chat_id: chatId ?? null,
  }).then(({ error }) => {
    if (error) console.warn("[CallEngine] calls insert error:", error.message);
  }, () => {});

  // Ring timeout — callee didn't answer (offline or ignored)
  _ringTimer = setTimeout(() => {
    if (_status === "outgoing_ringing") {
      _saveCallRecord("missed");
      _doHangup("unreachable");
    }
  }, RING_TIMEOUT_MS);
}

// ─── Accept incoming call (callee side) ──────────────────────────────────────

export async function acceptCall(notice: IncomingCallNotice, params: {
  myId: string;
  myName: string;
  myAvatar: string | null;
}): Promise<void> {
  if (!_getRTC()) throw new Error("WEBRTC_UNAVAILABLE");
  // Accept from incoming_ringing (normal path) OR idle when a realtime
  // broadcast was missed while the app was backgrounded.
  if (_status !== "incoming_ringing" && _status !== "idle") throw new Error("Cannot accept now");
  // If the engine is still idle, transition to incoming_ringing now so all
  // downstream status checks see a consistent state.
  if (_status === "idle") {
    setStatus("incoming_ringing");
  }

  const { myId, myName, myAvatar } = params;

  _info = {
    callId: notice.callId,
    callerId: notice.callerId,
    calleeId: myId,
    callerName: notice.callerName,
    callerAvatar: notice.callerAvatar,
    calleeName: myName,
    calleeAvatar: myAvatar,
    chatId: notice.chatId,
    startedAt: Date.now(),
    answeredAt: null,
    isCaller: false,
  };

  setStatus("connecting");
  _activateAudioMode(false);
  _activateKeepAwake();

  // Explicitly clean up the cancel-watcher before _subscribeSignaling, since
  // both share the same Realtime topic and Supabase only allows one channel per
  // topic per client.
  _cleanupCancelCh();

  // Subscribe to signaling, then broadcast `ringing` to trigger the caller's offer
  await _subscribeSignaling(notice.callId, false);
  _signalingCh?.send({
    type: "broadcast",
    event: "ringing",
    payload: { calleeId: myId },
  });
}

// ─── Decline incoming call ────────────────────────────────────────────────────

export function declineCall(callId: string) {
  // Clean up the cancel-watcher we subscribed on incoming
  _cleanupCancelCh();

  const ch = supabase.channel(`call:${callId}`, {
    config: { broadcast: { self: true } },
  });
  ch.subscribe((status: string) => {
    if (status === "SUBSCRIBED") {
      ch.send({ type: "broadcast", event: "decline", payload: {} });
      setTimeout(() => supabase.removeChannel(ch).catch(() => {}), 1000);
    }
  });
  _doHangup("idle");
}

// ─── End active call ──────────────────────────────────────────────────────────
//
// IMPORTANT: await the `end` broadcast before tearing down the signaling
// channel.  send() returns a Promise that resolves once the frame has been
// queued to the Supabase WebSocket.  If we call _doHangup() first, the channel
// is removed immediately and the WebSocket frame is never flushed, so the
// remote peer never receives the "end" event and stays stuck on-screen.
// We race the send against a 1.5 s safety timeout so a broken connection
// never blocks the local hang-up UI.

export async function endCall(): Promise<void> {
  const duration = _info?.answeredAt
    ? Math.round((Date.now() - _info.answeredAt) / 1000)
    : null;

  if (_signalingCh) {
    await Promise.race([
      _signalingCh.send({ type: "broadcast", event: "end", payload: {} }),
      new Promise<void>((r) => setTimeout(r, 1_500)),
    ]).catch(() => {});
  }

  if (_status === "active" || _status === "connecting") {
    _saveCallRecord("ended", duration);
  } else if (_status === "outgoing_ringing") {
    _saveCallRecord("missed");
  }

  _doHangup("ended");
}

// ─── Mute / speaker toggles ───────────────────────────────────────────────────

export function toggleMute(): boolean {
  _isMuted = !_isMuted;
  if (_localStream) {
    _localStream.getAudioTracks().forEach((track: any) => {
      track.enabled = !_isMuted;
    });
  }
  return _isMuted;
}

export function toggleSpeaker(): boolean {
  _isSpeaker = !_isSpeaker;
  _activateAudioMode(_isSpeaker);
  return _isSpeaker;
}

export function getIsMuted()   { return _isMuted;   }
export function getIsSpeaker() { return _isSpeaker; }
export function getStatus()    { return _status;     }
export function getCallInfo()  { return _info;       }

// ─── Internal: cancel-watcher channel ────────────────────────────────────────
// Subscribed when the callee enters incoming_ringing. Listens for `end` from
// the caller (caller cancelled before callee answered) so the UI can reset.

function _subscribeCancelWatcher(callId: string) {
  _cleanupCancelCh(); // shouldn't be set, but defensive

  _cancelCh = supabase
    .channel(`call:${callId}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: "end" }, () => {
      // Caller cancelled while we were showing the incoming modal — reset to idle
      if (_status === "incoming_ringing") {
        _cleanupCancelCh();
        setStatus("idle");
      }
    })
    .on("broadcast", { event: "decline" }, () => {
      // Shouldn't happen (callee sends this, not caller) but reset if it does
      if (_status === "incoming_ringing") {
        _cleanupCancelCh();
        setStatus("idle");
      }
    })
    .subscribe();
}

function _cleanupCancelCh() {
  if (_cancelCh) {
    supabase.removeChannel(_cancelCh).catch(() => {});
    _cancelCh = null;
  }
}

// ─── Internal: subscribe to call:${callId} signaling channel ─────────────────

async function _subscribeSignaling(callId: string, isCaller: boolean): Promise<void> {
  // Remove stale channel with same name if present (e.g. the cancel-watcher)
  const stale = supabase.getChannels().find((c: any) => c.topic === `realtime:call:${callId}`);
  if (stale) {
    await supabase.removeChannel(stale).catch(() => {});
    // Null out _cancelCh if it was the stale channel
    if (_cancelCh === stale) _cancelCh = null;
  }

  return new Promise((resolve) => {
    const ch = supabase
      .channel(`call:${callId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "ringing" }, () => {
        if (!isCaller) return;
        // Callee is ready — create and send the offer
        _createAndSendOffer().catch((e) => {
          emit({ type: "error", message: "Failed to create offer: " + (e?.message ?? e) });
          _doHangup("ended");
        });
      })
      .on("broadcast", { event: "offer" }, ({ payload }: any) => {
        if (isCaller || !payload?.sdp) return;
        _handleOffer(payload.sdp).catch((e) => {
          emit({ type: "error", message: "Failed to handle offer: " + (e?.message ?? e) });
          _doHangup("ended");
        });
      })
      .on("broadcast", { event: "answer" }, ({ payload }: any) => {
        if (!isCaller || !payload?.sdp) return;
        _handleAnswer(payload.sdp).catch((e) => {
          emit({ type: "error", message: "Failed to handle answer: " + (e?.message ?? e) });
          _doHangup("ended");
        });
      })
      .on("broadcast", { event: "ice_candidate" }, ({ payload }: any) => {
        if (!payload?.candidate) return;
        _addRemoteCandidate(payload.candidate);
      })
      .on("broadcast", { event: "decline" }, () => {
        _saveCallRecord("declined");
        // Emit busy so the caller sees a "User is busy" toast instead of
        // silently ending — matches the experience when callee is already in a call.
        emit({ type: "busy" });
        _doHangup("ended");
      })
      .on("broadcast", { event: "end" }, () => {
        if (_status === "active" || _status === "connecting") {
          const dur = _info?.answeredAt
            ? Math.round((Date.now() - _info.answeredAt) / 1000)
            : null;
          _saveCallRecord("ended", dur);
        }
        _doHangup("ended");
      })
      .on("broadcast", { event: "busy" }, () => {
        _saveCallRecord("missed");
        emit({ type: "busy" });
        _doHangup("ended");
      })
      .on("broadcast", { event: "heartbeat" }, () => {
        _lastHeartbeatAt = Date.now();
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") resolve();
      });

    _signalingCh = ch;

    // Safety timeout — if Supabase never confirms SUBSCRIBED (e.g. slow network
    // or temporary outage), unblock so the ring timer still starts and the call
    // can time-out cleanly instead of hanging in "outgoing_ringing" forever.
    setTimeout(resolve, 8_000);
  });
}

// ─── Internal: WebRTC flow ────────────────────────────────────────────────────

async function _ensureLocalStream(): Promise<any> {
  if (_localStream) return _localStream;
  let stream: any;
  try {
    stream = await _getRTC()!.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });
  } catch (err: any) {
    // Provide a human-readable message for the two most common web errors:
    // NotAllowedError = user denied mic permission
    // NotFoundError   = no microphone device found
    const name = err?.name ?? "";
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      throw new Error("Microphone permission denied. Please allow microphone access and try again.");
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      throw new Error("No microphone found. Please connect a microphone and try again.");
    }
    throw err;
  }
  _localStream = stream;
  return stream;
}

function _createPC(): any {
  const Constructor = _requireRTC().RTCPeerConnection as any;
  const pc = new Constructor({
    iceServers: ICE_SERVERS,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    sdpSemantics: "unified-plan",
  });

  // Web: pipe incoming audio tracks to a hidden <audio> element so the browser
  // actually plays the remote voice. On native, react-native-webrtc handles
  // audio routing automatically via the OS audio session.
  if (Platform.OS === "web") {
    pc.ontrack = (e: any) => {
      try {
        const g = globalThis as any;
        if (typeof g.document === "undefined") return;
        let el: HTMLAudioElement = g.document.getElementById("__afucall_audio");
        if (!el) {
          el = g.document.createElement("audio");
          el.id = "__afucall_audio";
          el.autoplay = true;
          (el as any).playsInline = true;
          el.style.display = "none";
          g.document.body.appendChild(el);
        }
        const stream = e.streams?.[0];
        if (stream) el.srcObject = stream;
      } catch {}
    };
  }

  pc.onicecandidate = (e: any) => {
    if (!e.candidate || !_signalingCh) return;
    _signalingCh.send({
      type: "broadcast",
      event: "ice_candidate",
      payload: { candidate: e.candidate },
    });
  };

  pc.oniceconnectionstatechange = () => {
    const state: string = pc.iceConnectionState;
    emit({ type: "ice_state", state });

    if (state === "connected" || state === "completed") {
      _clearDisconnectWatchdog();
      if (_status === "connecting") {
        if (_info) _info.answeredAt = _info.answeredAt ?? Date.now();
        _clearConnectTimer();
        setStatus("active");
        _startHeartbeat();
      }
    } else if (state === "failed") {
      const wasActive = !!_info?.answeredAt;
      emit({
        type: "error",
        message: wasActive ? "Connection lost." : "Connection failed. Check your network.",
      });
      _doHangup(wasActive ? "connection_lost" : "ended");
    } else if (state === "disconnected") {
      _clearDisconnectWatchdog();
      _disconnectWatchdog = setTimeout(() => {
        if (_status === "active" || _status === "connecting") {
          emit({ type: "error", message: "Connection lost." });
          _doHangup("connection_lost");
        }
      }, DISCONNECT_WATCHDOG_MS);
    } else if (state === "closed") {
      if (_status === "active" || _status === "connecting") {
        _doHangup("connection_lost");
      }
    }
  };

  return pc;
}

async function _createAndSendOffer(): Promise<void> {
  _clearRingTimer();

  const stream = await _ensureLocalStream();
  const pc = _createPC();
  _pc = pc;

  stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));

  const offer = await pc.createOffer({
    offerToReceiveAudio: true,
    offerToReceiveVideo: false,
  });

  const sdp = _preferOpus(offer.sdp ?? "");
  const modifiedOffer = { type: offer.type, sdp };
  await pc.setLocalDescription(_newRTCSessionDescription(modifiedOffer));

  _signalingCh?.send({
    type: "broadcast",
    event: "offer",
    payload: { sdp },
  });

  setStatus("connecting");

  _connectTimer = setTimeout(() => {
    if (_status === "connecting") {
      emit({ type: "error", message: "Connection timed out." });
      _doHangup("ended");
    }
  }, CONNECT_TIMEOUT_MS);
}

async function _handleOffer(sdp: string): Promise<void> {
  const stream = await _ensureLocalStream();
  const pc = _createPC();
  _pc = pc;

  stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));

  await pc.setRemoteDescription(
    _newRTCSessionDescription({ type: "offer", sdp })
  );
  _remoteDescSet = true;
  await _drainPendingCandidates();

  const answer = await pc.createAnswer();
  const answerSdp = _preferOpus(answer.sdp ?? "");
  await pc.setLocalDescription(
    _newRTCSessionDescription({ type: "answer", sdp: answerSdp })
  );

  _signalingCh?.send({
    type: "broadcast",
    event: "answer",
    payload: { sdp: answerSdp },
  });

  if (_info) _info.answeredAt = Date.now();
  setStatus("connecting");

  _connectTimer = setTimeout(() => {
    if (_status === "connecting") {
      emit({ type: "error", message: "Connection timed out." });
      _doHangup("ended");
    }
  }, CONNECT_TIMEOUT_MS);
}

async function _handleAnswer(sdp: string): Promise<void> {
  if (!_pc) return;
  await _pc.setRemoteDescription(
    _newRTCSessionDescription({ type: "answer", sdp })
  );
  _remoteDescSet = true;
  if (_info) _info.answeredAt = _info.answeredAt ?? Date.now();
  await _drainPendingCandidates();
}

function _addRemoteCandidate(candidate: any) {
  if (_remoteDescSet && _pc) {
    try {
      void _pc.addIceCandidate(_newRTCIceCandidate(candidate)).catch(() => {});
    } catch {}
  } else {
    _pendingCandidates.push(candidate);
  }
}

async function _drainPendingCandidates() {
  if (!_pc) return;
  for (const c of _pendingCandidates) {
    try {
      await _pc.addIceCandidate(_newRTCIceCandidate(c));
    } catch {}
  }
  _pendingCandidates = [];
}

// ─── Internal: audio mode (speaker/earpiece) ──────────────────────────────────
// IMPORTANT: wrap every setAudioModeAsync call in try/catch. On web, the
// function may not exist or may throw synchronously (before returning a Promise),
// in which case the trailing .catch() would never run. A synchronous throw
// propagating out of _activateAudioMode crashes engineAccept / engineStart and
// prevents the call from connecting while leaving the engine in a half-started
// "connecting" state (modal gone, call screen never pushed).

function _activateAudioMode(speakerOn: boolean) {
  if (!_AV) return;
  try {
    const p = _AV.Audio.setAudioModeAsync({
      allowsRecordingIOS: true,   // MUST be true on iOS so WebRTC can capture the mic
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: !speakerOn,
      interruptionModeIOS: 1, // DO_NOT_MIX
      interruptionModeAndroid: 1,
    } as any);
    if (p && typeof (p as any).catch === "function") (p as any).catch(() => {});
  } catch {}
}

function _deactivateAudioMode() {
  if (!_AV) return;
  try {
    const p = _AV.Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    } as any);
    if (p && typeof (p as any).catch === "function") (p as any).catch(() => {});
  } catch {}
}

// ─── Internal: keep-awake ─────────────────────────────────────────────────────

function _activateKeepAwake() {
  if (_keepAwakeActive) return;
  try {
    const p: any = _KA?.activateKeepAwakeAsync(_keepAwakeTag);
    if (p && typeof p.catch === "function") p.catch(() => {});
    _keepAwakeActive = true;
  } catch {}
}

function _deactivateKeepAwake() {
  if (!_keepAwakeActive) return;
  _keepAwakeActive = false;
  try {
    const p: any = _KA?.deactivateKeepAwake(_keepAwakeTag);
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}
}

// ─── Internal: busy signal ────────────────────────────────────────────────────

function _sendBusy(callId: string, _callerId: string) {
  const ch = supabase.channel(`call:${callId}`, {
    config: { broadcast: { self: true } },
  });
  ch.subscribe((status: string) => {
    if (status === "SUBSCRIBED") {
      const sp: any = ch.send({ type: "broadcast", event: "busy", payload: {} });
      if (sp && typeof sp.catch === "function") sp.catch(() => {});
      setTimeout(() => supabase.removeChannel(ch).catch(() => {}), 1000);
    }
  });
}

// ─── Internal: cleanup ────────────────────────────────────────────────────────

function _clearRingTimer() {
  if (_ringTimer) { clearTimeout(_ringTimer); _ringTimer = null; }
}

function _clearConnectTimer() {
  if (_connectTimer) { clearTimeout(_connectTimer); _connectTimer = null; }
}

function _clearDisconnectWatchdog() {
  if (_disconnectWatchdog) { clearTimeout(_disconnectWatchdog); _disconnectWatchdog = null; }
}

// ─── Internal: heartbeat ──────────────────────────────────────────────────────

function _startHeartbeat() {
  _stopHeartbeat();
  _lastHeartbeatAt = Date.now();

  _heartbeatSendTimer = setInterval(() => {
    if (_status !== "active") return;
    const hp: any = _signalingCh?.send({ type: "broadcast", event: "heartbeat", payload: {} });
    if (hp && typeof hp.catch === "function") hp.catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  _heartbeatWatchdogTimer = setInterval(() => {
    if (_status !== "active") return;
    if (Date.now() - _lastHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
      emit({ type: "error", message: "Connection lost." });
      _doHangup("connection_lost");
    }
  }, HEARTBEAT_INTERVAL_MS);
}

function _stopHeartbeat() {
  if (_heartbeatSendTimer)    { clearInterval(_heartbeatSendTimer);    _heartbeatSendTimer    = null; }
  if (_heartbeatWatchdogTimer){ clearInterval(_heartbeatWatchdogTimer); _heartbeatWatchdogTimer = null; }
}

function _doHangup(finalStatus: CallStatus) {
  _clearRingTimer();
  _clearConnectTimer();
  _clearDisconnectWatchdog();
  _stopHeartbeat();

  // Clean up cancel-watcher (present during incoming_ringing)
  _cleanupCancelCh();

  // Cleanup peer connection
  if (_pc) {
    try { _pc.close(); } catch {}
    _pc = null;
  }

  // Stop local audio tracks
  if (_localStream) {
    _localStream.getTracks().forEach((t: any) => { try { t.stop(); } catch {} });
    _localStream = null;
  }

  // Remove signaling channel — intentionally delayed 600 ms so any in-flight
  // broadcasts (e.g. the "end" event sent synchronously in endCall()) have time
  // to flush through the Supabase Realtime WebSocket before the channel is torn
  // down. Without the delay, the remote peer may never receive the "end" event
  // and the call screen on their side stays stuck open.
  if (_signalingCh) {
    const _ch = _signalingCh;
    _signalingCh = null;
    setTimeout(() => supabase.removeChannel(_ch).catch(() => {}), 600);
  }

  // Web: detach and remove the hidden <audio> element used for remote playback
  if (Platform.OS === "web") {
    try {
      const g = globalThis as any;
      const el = g.document?.getElementById("__afucall_audio");
      if (el) {
        el.srcObject = null;
        el.remove();
      }
    } catch {}
  }

  _remoteDescSet = false;
  _pendingCandidates = [];
  _isMuted = false;
  _isSpeaker = false;

  _deactivateAudioMode();
  _deactivateKeepAwake();

  const wasInfo = _info;
  _info = null;

  setStatus(finalStatus);

  // After terminal status briefly shown, reset to idle
  if (
    finalStatus === "ended" ||
    finalStatus === "unreachable" ||
    finalStatus === "connection_lost"
  ) {
    setTimeout(() => {
      if (
        _status === "ended" ||
        _status === "unreachable" ||
        _status === "connection_lost"
      ) {
        _info = null;
        setStatus("idle");
      }
    }, 3_000);
  }

  void wasInfo;
}

// ─── Internal: save call record to SQLite ─────────────────────────────────────

function _saveCallRecord(
  status: "ended" | "declined" | "missed" | "busy",
  duration?: number | null,
) {
  if (!_info) return;

  const now = new Date().toISOString();

  // Save to local SQLite for call history UI
  saveLocalCall({
    id: _info.callId,
    room_id: _info.callId,
    caller_id: _info.callerId,
    callee_id: _info.calleeId,
    call_type: "voice",
    status,
    started_at: new Date(_info.startedAt).toISOString(),
    answered_at: _info.answeredAt ? new Date(_info.answeredAt).toISOString() : null,
    ended_at: now,
    duration_seconds: duration ?? null,
    chat_id: _info.chatId,
    caller: { display_name: _info.callerName, avatar_url: _info.callerAvatar ?? undefined },
    callee: { display_name: _info.calleeName, avatar_url: _info.calleeAvatar ?? undefined },
  });

  // Upsert final status to Supabase so the server-side row stays accurate.
  // Uses upsert so it works whether or not the INSERT in startCall succeeded.
  supabase.from("calls").upsert({
    id: _info.callId,
    room_id: _info.callId,
    caller_id: _info.callerId,
    callee_id: _info.calleeId,
    call_type: "voice",
    status,
    started_at: new Date(_info.startedAt).toISOString(),
    answered_at: _info.answeredAt ? new Date(_info.answeredAt).toISOString() : null,
    ended_at: now,
    duration_seconds: duration ?? null,
    chat_id: _info.chatId,
  }, { onConflict: "id", ignoreDuplicates: false }).then(({ error }) => {
    if (error) console.warn("[CallEngine] calls upsert error:", error.message);
  }, () => {});
}

// ─── SDP: prefer Opus codec ───────────────────────────────────────────────────

function _preferOpus(sdp: string): string {
  try {
    const lines = sdp.split("\n");
    let opusPayload = "";

    for (const line of lines) {
      const match = line.match(/a=rtpmap:(\d+) opus\/48000/i);
      if (match) { opusPayload = match[1]; break; }
    }

    if (!opusPayload) return sdp;

    return lines.map((line) => {
      if (!line.startsWith("m=audio")) return line;
      const parts = line.split(" ");
      const payloads = parts.slice(3).filter((p) => p.trim() !== opusPayload);
      return [...parts.slice(0, 3), opusPayload, ...payloads].join(" ");
    }).join("\n");
  } catch {
    return sdp;
  }
}

// Expose for testing
export { _info as __callInfo, _status as __callStatus };
