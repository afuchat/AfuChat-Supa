// ─── AfuChat Call Engine ──────────────────────────────────────────────────────
// Manages the full lifecycle of a P2P voice call.
//
// STACK
//   • react-native-webrtc  — audio codec (Opus, ~20 kbps), P2P via STUN
//   • Supabase Realtime Broadcast — signaling (offer/answer/ICE, no DB needed)
//   • expo-av AudioMode    — speaker/earpiece routing + silent-mode overrides
//   • expo-keep-awake      — prevents screen dimming during active call
//
// SIGNALING PROTOCOL (race-free, no DB dependency)
//   1. Caller subscribes to call:${callId} channel
//   2. Caller notifies callee via user-call:${calleeId} broadcast + push notification
//   3. Callee accepts → subscribes to call:${callId} → broadcasts `ringing`
//   4. Caller receives `ringing` → creates offer SDP → broadcasts `offer`
//   5. Callee receives `offer` → creates answer SDP → broadcasts `answer`
//   6. Caller receives `answer` → setRemoteDescription
//   7. Both trickle ICE candidates via `ice_candidate` events
//   8. ICE checks complete → P2P audio established
//
// DATA EFFICIENCY
//   • Opus codec at ~20 kbps (WebRTC default for voice)
//   • STUN-only (free Google STUN) — audio goes directly P2P, zero relay overhead
//   • Signaling is a few hundred bytes per call setup total
// ─────────────────────────────────────────────────────────────────────────────

import { Platform, NativeModules } from "react-native";
import { supabase } from "@/lib/supabase";
import { saveLocalCall } from "@/lib/storage/localCallHistory";

// ─── Lazy-load WebRTC (not available in Expo Go) ──────────────────────────────
// Same pattern as RNTP: check NativeModules first so the try-require never
// throws the uncatchable Java NullPointerException that Expo Go produces.

type WebRTCType = typeof import("react-native-webrtc");

const _RTC: WebRTCType | null = (() => {
  try {
    if (!NativeModules.WebRTCModule) return null;
    return require("react-native-webrtc") as WebRTCType;
  } catch {
    return null;
  }
})();

export const WEBRTC_AVAILABLE = _RTC !== null;

// ─── Lazy-load expo-av + expo-keep-awake ─────────────────────────────────────

const _AV: typeof import("expo-av") | null = (() => {
  try { return require("expo-av"); } catch { return null; }
})();

const _KA: typeof import("expo-keep-awake") | null = (() => {
  try { return require("expo-keep-awake"); } catch { return null; }
})();

// ─── ICE servers — free Google STUN, zero cost, no relay overhead ────────────

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

// ─── Ring timeout: auto-hangup if callee doesn't answer ──────────────────────
const RING_TIMEOUT_MS   = 30_000; // 30 s ringing before declaring missed
const CONNECT_TIMEOUT_MS = 20_000; // 20 s for ICE after SDP exchange

// ─── Types ───────────────────────────────────────────────────────────────────

export type CallStatus =
  | "idle"
  | "outgoing_ringing"   // we placed the call, waiting for callee
  | "incoming_ringing"   // callee side — waiting for us to accept
  | "connecting"         // SDP exchanged, establishing ICE
  | "active"             // audio flowing
  | "ended";             // brief terminal state before reset

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
  | { type: "error"; message: string };

type Listener = (event: CallEngineEvent) => void;

// ─── Module-level singleton state ────────────────────────────────────────────

let _status: CallStatus = "idle";
let _info: CallInfo | null = null;
let _pc: any | null = null;                    // RTCPeerConnection
let _localStream: any | null = null;           // MediaStream
let _signalingCh: any | null = null;           // call:${callId} channel
let _inboxCh: any | null = null;               // user-call:${userId} channel
let _currentUserId: string | null = null;
let _pendingCandidates: any[] = [];            // queued before remote desc ready
let _remoteDescSet = false;
let _isMuted = false;
let _isSpeaker = false;
let _ringTimer: ReturnType<typeof setTimeout> | null = null;
let _connectTimer: ReturnType<typeof setTimeout> | null = null;
let _listeners = new Set<Listener>();
let _keepAwakeTag = "afucall";

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
}

// ─── Init: subscribe to user-call inbox for foreground incoming calls ─────────

export function initCallEngine(userId: string) {
  if (_currentUserId === userId) return; // already initialised for this user
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
      // Ignore if we're already in a call
      if (_status !== "idle") {
        // Send busy signal back
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
  if (!WEBRTC_AVAILABLE) throw new Error("WEBRTC_UNAVAILABLE");
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

  // Subscribe to signaling channel
  await _subscribeSignaling(callId, true);

  // Broadcast to callee's inbox (foreground fast-path)
  const calleeInbox = supabase.channel(`user-call:${calleeId}`, {
    config: { broadcast: { self: true } },
  });
  await new Promise<void>((resolve) => {
    calleeInbox.subscribe((status: string) => {
      if (status === "SUBSCRIBED") resolve();
    });
  });
  calleeInbox.send({
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

  // Ring timeout
  _ringTimer = setTimeout(() => {
    if (_status === "outgoing_ringing") {
      // Callee didn't answer — save as missed on caller's side, tear down
      _saveCallRecord("missed");
      _doHangup("ended");
    }
  }, RING_TIMEOUT_MS);
}

// ─── Accept incoming call (callee side) ──────────────────────────────────────

export async function acceptCall(notice: IncomingCallNotice, params: {
  myId: string;
  myName: string;
  myAvatar: string | null;
}): Promise<void> {
  if (!WEBRTC_AVAILABLE) throw new Error("WEBRTC_UNAVAILABLE");
  if (_status !== "idle" && _status !== "incoming_ringing") throw new Error("Cannot accept now");

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

export function endCall() {
  const duration = _info?.answeredAt
    ? Math.round((Date.now() - _info.answeredAt) / 1000)
    : null;

  _signalingCh?.send({ type: "broadcast", event: "end", payload: {} });

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

// ─── Internal: subscribe to call:${callId} signaling channel ─────────────────

async function _subscribeSignaling(callId: string, isCaller: boolean): Promise<void> {
  // Remove stale channel with same name if present
  const stale = supabase.getChannels().find((c: any) => c.topic === `realtime:call:${callId}`);
  if (stale) await supabase.removeChannel(stale).catch(() => {});

  return new Promise((resolve) => {
    const ch = supabase
      .channel(`call:${callId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "ringing" }, () => {
        if (!isCaller) return;
        // Callee is ready — create and send the offer
        _createAndSendOffer().catch((e) => {
          emit({ type: "error", message: "Failed to create offer: " + e.message });
          _doHangup("ended");
        });
      })
      .on("broadcast", { event: "offer" }, ({ payload }: any) => {
        if (isCaller || !payload?.sdp) return;
        _handleOffer(payload.sdp).catch((e) => {
          emit({ type: "error", message: "Failed to handle offer: " + e.message });
          _doHangup("ended");
        });
      })
      .on("broadcast", { event: "answer" }, ({ payload }: any) => {
        if (!isCaller || !payload?.sdp) return;
        _handleAnswer(payload.sdp).catch((e) => {
          emit({ type: "error", message: "Failed to handle answer: " + e.message });
          _doHangup("ended");
        });
      })
      .on("broadcast", { event: "ice_candidate" }, ({ payload }: any) => {
        if (!payload?.candidate) return;
        _addRemoteCandidate(payload.candidate);
      })
      .on("broadcast", { event: "decline" }, () => {
        _saveCallRecord("declined");
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
        _doHangup("ended");
      })
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") resolve();
      });

    _signalingCh = ch;
  });
}

// ─── Internal: WebRTC flow ────────────────────────────────────────────────────

async function _ensureLocalStream(): Promise<any> {
  if (_localStream) return _localStream;
  const stream = await _RTC!.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  });
  _localStream = stream;
  return stream;
}

function _createPC(): any {
  const pc = new _RTC!.RTCPeerConnection({
    iceServers: ICE_SERVERS,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    sdpSemantics: "unified-plan",
  });

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
      if (_status === "connecting") {
        if (_info) _info.answeredAt = _info.answeredAt ?? Date.now();
        _clearConnectTimer();
        setStatus("active");
      }
    } else if (state === "failed") {
      emit({ type: "error", message: "Connection failed. Check your network." });
      _doHangup("ended");
    } else if (state === "disconnected") {
      // Brief disconnect — wait for reconnect or failure
    } else if (state === "closed") {
      if (_status === "active") _doHangup("ended");
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

  // Prefer Opus codec
  const sdp = _preferOpus(offer.sdp ?? "");
  const modifiedOffer = { type: offer.type, sdp };
  await pc.setLocalDescription(new _RTC!.RTCSessionDescription(modifiedOffer));

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
    new _RTC!.RTCSessionDescription({ type: "offer", sdp })
  );
  _remoteDescSet = true;
  await _drainPendingCandidates();

  const answer = await pc.createAnswer();
  const answerSdp = _preferOpus(answer.sdp ?? "");
  await pc.setLocalDescription(
    new _RTC!.RTCSessionDescription({ type: "answer", sdp: answerSdp })
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
    new _RTC!.RTCSessionDescription({ type: "answer", sdp })
  );
  _remoteDescSet = true;
  if (_info) _info.answeredAt = _info.answeredAt ?? Date.now();
  await _drainPendingCandidates();
}

function _addRemoteCandidate(candidate: any) {
  if (_remoteDescSet && _pc) {
    try {
      _pc.addIceCandidate(new _RTC!.RTCIceCandidate(candidate)).catch(() => {});
    } catch {}
  } else {
    _pendingCandidates.push(candidate);
  }
}

async function _drainPendingCandidates() {
  if (!_pc) return;
  for (const c of _pendingCandidates) {
    try {
      await _pc.addIceCandidate(new _RTC!.RTCIceCandidate(c));
    } catch {}
  }
  _pendingCandidates = [];
}

// ─── Internal: audio mode (speaker/earpiece) ──────────────────────────────────

function _activateAudioMode(speakerOn: boolean) {
  if (!_AV) return;
  _AV.Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
    staysActiveInBackground: true,
    shouldDuckAndroid: false,
    playThroughEarpieceAndroid: !speakerOn,
    interruptionModeIOS: 1, // DO_NOT_MIX
    interruptionModeAndroid: 1,
  } as any).catch(() => {});
}

function _deactivateAudioMode() {
  if (!_AV) return;
  _AV.Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: false,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  } as any).catch(() => {});
}

// ─── Internal: keep-awake ─────────────────────────────────────────────────────

function _activateKeepAwake() {
  try { _KA?.activateKeepAwakeAsync(_keepAwakeTag); } catch {}
}

function _deactivateKeepAwake() {
  try { _KA?.deactivateKeepAwake(_keepAwakeTag); } catch {}
}

// ─── Internal: busy signal ────────────────────────────────────────────────────

function _sendBusy(callId: string, _callerId: string) {
  const ch = supabase.channel(`call:${callId}`, {
    config: { broadcast: { self: true } },
  });
  ch.subscribe((status: string) => {
    if (status === "SUBSCRIBED") {
      ch.send({ type: "broadcast", event: "busy", payload: {} });
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

function _doHangup(finalStatus: CallStatus) {
  _clearRingTimer();
  _clearConnectTimer();

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

  // Remove signaling channel
  if (_signalingCh) {
    supabase.removeChannel(_signalingCh).catch(() => {});
    _signalingCh = null;
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

  // After "ended" briefly shown, reset to idle
  if (finalStatus === "ended") {
    setTimeout(() => {
      if (_status === "ended") {
        _info = null;
        setStatus("idle");
      }
    }, 3_000);
  }

  void wasInfo; // suppress unused warning
}

// ─── Internal: save call record to SQLite ─────────────────────────────────────

function _saveCallRecord(
  status: "ended" | "declined" | "missed" | "busy",
  duration?: number | null,
) {
  if (!_info) return;
  saveLocalCall({
    id: _info.callId,
    room_id: _info.callId,
    caller_id: _info.callerId,
    callee_id: _info.calleeId,
    call_type: "voice",
    status,
    started_at: new Date(_info.startedAt).toISOString(),
    answered_at: _info.answeredAt ? new Date(_info.answeredAt).toISOString() : null,
    ended_at: new Date().toISOString(),
    duration_seconds: duration ?? null,
    chat_id: _info.chatId,
    caller: { display_name: _info.callerName, avatar_url: _info.callerAvatar ?? undefined },
    callee: { display_name: _info.calleeName, avatar_url: _info.calleeAvatar ?? undefined },
  }).catch(() => {});
}

// ─── SDP: prefer Opus codec ───────────────────────────────────────────────────
// Moves the Opus payload type to the first position in the m=audio line so
// the peer prefers it. Opus at ~20 kbps is the most data-efficient voice codec.

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
