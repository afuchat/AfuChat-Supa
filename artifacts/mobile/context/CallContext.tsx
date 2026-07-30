// ─── AfuChat Call Context ─────────────────────────────────────────────────────
// React wrapper around callEngine. Provides:
//   • current call state (status, info, muted, speaker)
//   • startCall / acceptCall / declineCall / endCall actions
//   • incoming call notifications (IncomingCallNotice)
// Must be mounted inside <AuthProvider> and outside the navigation stack so
// IncomingCallModal can render above every screen.
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/context/AuthContext";
import {
  initCallEngine,
  teardownCallEngine,
  startCall as engineStart,
  acceptCall as engineAccept,
  declineCall as engineDecline,
  endCall as engineEnd,
  toggleMute as engineMute,
  toggleSpeaker as engineSpeaker,
  addCallEngineListener,
  WEBRTC_AVAILABLE,
  type CallStatus,
  type CallInfo,
  type IncomingCallNotice,
} from "@/lib/callEngine";
import { listenPushIncomingCall } from "@/lib/callPushBridge";
import { notifyIncomingCall } from "@/lib/notifyUser";
import { showToast } from "@/lib/toast";
import { getMicPermissionState, requestMicPermission } from "@/lib/micPermission";
import { MicPermissionModal } from "@/components/MicPermissionModal";

// ─── Context shape ────────────────────────────────────────────────────────────

interface CallContextValue {
  status: CallStatus;
  callInfo: CallInfo | null;
  incomingNotice: IncomingCallNotice | null;
  isMuted: boolean;
  isSpeaker: boolean;
  isAvailable: boolean;
  /** True when the device mic permission is permanently blocked. */
  micBlocked: boolean;
  /** Opens the mic-permission guidance modal programmatically. */
  showMicPermModal: () => void;
  startCall: (params: {
    calleeId: string;
    calleeName: string;
    calleeAvatar: string | null;
    chatId: string | null;
  }) => Promise<void>;
  acceptCall: () => Promise<void>;
  declineCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  /** Called by push-notification handler when app opens via missed incoming_call tap */
  handlePushIncoming: (notice: IncomingCallNotice) => void;
}

const CallContext = createContext<CallContextValue | null>(null);

// Safe no-op returned when useCall() is called outside CallProvider (e.g. during
// hot-reload transitions or in screens that rendered before the provider mounted).
// isAvailable: false means the call button never shows, so the user can't
// accidentally trigger a call in this transient state.
const _NOOP_CTX: CallContextValue = {
  status: "idle",
  callInfo: null,
  incomingNotice: null,
  isMuted: false,
  isSpeaker: false,
  isAvailable: false,
  micBlocked: false,
  showMicPermModal: () => {},
  startCall: async () => {},
  acceptCall: async () => {},
  declineCall: () => {},
  endCall: () => {},
  toggleMute: () => {},
  toggleSpeaker: () => {},
  handlePushIncoming: () => {},
};

export function useCall(): CallContextValue {
  return useContext(CallContext) ?? _NOOP_CTX;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();

  const [status, setStatus]               = useState<CallStatus>("idle");
  const [callInfo, setCallInfo]           = useState<CallInfo | null>(null);
  const [incomingNotice, setIncomingNotice] = useState<IncomingCallNotice | null>(null);
  const [isMuted, setIsMuted]             = useState(false);
  const [isSpeaker, setIsSpeaker]         = useState(false);
  const [micBlocked, setMicBlocked]       = useState(false);
  const [_micModalVisible, _setMicModalVisible] = useState(false);

  // Keep stable refs so callbacks never close over stale state
  const userRef    = useRef(user);
  const profileRef = useRef(profile);
  userRef.current    = user;
  profileRef.current = profile;

  // Stable ref to current status — used inside effects/callbacks without
  // capturing stale state. Must stay in sync with the `status` state.
  const _status_ref = useRef<CallStatus>("idle");
  _status_ref.current = status;

  // ── Init / tear-down engine when auth changes ─────────────────────────────
  useEffect(() => {
    if (user?.id) {
      initCallEngine(user.id);
    } else {
      teardownCallEngine();
      setStatus("idle");
      setCallInfo(null);
      setIncomingNotice(null);
    }
  }, [user?.id]);

  // ── Mic permission — check once on mount; re-check when app foregrounds ────
  useEffect(() => {
    let cancelled = false;
    const check = () =>
      getMicPermissionState().then((s) => {
        if (!cancelled) setMicBlocked(s === "denied");
      });
    check();
    // On native, re-check whenever the app comes back to foreground (user may
    // have changed settings). AppState is a RN API — import lazily to avoid
    // pulling it into web bundles unnecessarily.
    let sub: any;
    if (Platform.OS !== "web") {
      const { AppState } = require("react-native");
      sub = AppState.addEventListener("change", (state: string) => {
        if (state === "active") check();
      });
    }
    return () => {
      cancelled = true;
      sub?.remove?.();
    };
  }, []);

  // ── Handle push-notification incoming calls (app was in background) ─────────
  useEffect(() => {
    const unsub = listenPushIncomingCall((notice) => {
      // Accept if idle OR incoming_ringing (duplicate push for the same call)
      if (_status_ref.current !== "idle" && _status_ref.current !== "incoming_ringing") return;
      setIncomingNotice((prev) => prev ?? notice);
    });
    return unsub;
  }, []);

  // ── Subscribe to engine events ─────────────────────────────────────────────
  useEffect(() => {
    const unsub = addCallEngineListener((event) => {
      switch (event.type) {
        case "status":
          setStatus(event.status);
          setCallInfo(event.info);
          if (event.status === "active") {
            setIsMuted(false);
            setIsSpeaker(false);
          }
          if (event.status === "idle") {
            setIncomingNotice(null);
            setIsMuted(false);
            setIsSpeaker(false);
          }
          // Navigate to call screen when a call starts (outgoing)
          if (event.status === "outgoing_ringing" && event.info) {
            router.push({
              pathname: "/call/[id]",
              params: { id: event.info.callId },
            } as any);
          }
          // Navigate back when call ends
          if (event.status === "ended" || event.status === "idle") {
            // Let the call screen handle pop via its own status listener
          }
          break;

        case "incoming":
          // Engine already guards this (sets incoming_ringing before emitting),
          // but apply a final check — accept from idle OR incoming_ringing since
          // React state may lag one render behind the engine's synchronous update.
          if (_status_ref.current !== "idle" && _status_ref.current !== "incoming_ringing") break;
          setIncomingNotice(event.notice);
          break;

        case "ice_state":
          break; // handled by call screen

        case "error":
          showToast(event.message, { type: "error", duration: 4000 });
          break;

        case "busy":
          showToast("User is busy", { type: "warning", duration: 3000 });
          break;
      }
    });
    return unsub;
  }, []);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const startCall = useCallback(async (params: {
    calleeId: string;
    calleeName: string;
    calleeAvatar: string | null;
    chatId: string | null;
  }) => {
    const u = userRef.current;
    const p = profileRef.current;
    if (!u) return;

    // ── Mic permission pre-check ──────────────────────────────────────────────
    // On native: ask the OS if we haven't already, then bail if still denied.
    // On web: only bail if the browser reports an explicit "denied" state;
    // "prompt" is handled by getUserMedia inside the call engine.
    let permState = await getMicPermissionState();
    if (permState === "prompt" && Platform.OS !== "web") {
      const result = await requestMicPermission();
      permState = result;
    }
    if (permState === "denied") {
      setMicBlocked(true);
      _setMicModalVisible(true);
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    const callId = _uuid();

    try {
      await engineStart({
        callId,
        calleeId: params.calleeId,
        calleeName: params.calleeName,
        calleeAvatar: params.calleeAvatar,
        myId: u.id,
        myName: p?.display_name ?? "Unknown",
        myAvatar: p?.avatar_url ?? null,
        chatId: params.chatId,
      });

      // Push notification as fallback for background callee
      notifyIncomingCall({
        calleeId: params.calleeId,
        callerId: u.id,
        callId,
        callerName: p?.display_name ?? "Unknown",
        callerAvatar: p?.avatar_url ?? null,
        chatId: params.chatId,
      }).catch(() => {});
    } catch (e: any) {
      showToast("Could not start call", { type: "error", duration: 3000 });
    }
  }, []);

  const acceptCall = useCallback(async () => {
    const notice = incomingNotice;
    const u = userRef.current;
    const p = profileRef.current;
    if (!notice || !u) return;

    // ── Mic permission pre-check (same logic as startCall) ────────────────────
    let permState = await getMicPermissionState();
    if (permState === "prompt" && Platform.OS !== "web") {
      const result = await requestMicPermission();
      permState = result;
    }
    if (permState === "denied") {
      setMicBlocked(true);
      _setMicModalVisible(true);
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Clear notice AFTER engine accept so we don't lose it if accept throws
    try {
      await engineAccept(notice, {
        myId: u.id,
        myName: p?.display_name ?? "Unknown",
        myAvatar: p?.avatar_url ?? null,
      });

      // Clear incoming notice only once accept has succeeded
      setIncomingNotice(null);

      router.push({
        pathname: "/call/[id]",
        params: { id: notice.callId },
      } as any);
    } catch (e: any) {
      showToast("Could not connect call", { type: "error", duration: 3000 });
    }
  }, [incomingNotice]);

  const declineCall = useCallback(() => {
    const notice = incomingNotice;
    if (!notice) return;
    setIncomingNotice(null);
    engineDecline(notice.callId);
  }, [incomingNotice]);

  const endCall = useCallback(() => {
    engineEnd();
  }, []);

  const toggleMute = useCallback(() => {
    const newVal = engineMute();
    setIsMuted(newVal);
  }, []);

  const toggleSpeaker = useCallback(() => {
    const newVal = engineSpeaker();
    setIsSpeaker(newVal);
  }, []);

  const handlePushIncoming = useCallback((notice: IncomingCallNotice) => {
    // Only show if not already in a call
    if (_status_ref.current !== "idle") return;
    setIncomingNotice((prev) => prev ?? notice);
  }, []);

  return (
    <CallContext.Provider value={{
      status,
      callInfo,
      incomingNotice,
      isMuted,
      isSpeaker,
      isAvailable: WEBRTC_AVAILABLE,
      micBlocked,
      showMicPermModal: () => _setMicModalVisible(true),
      startCall,
      acceptCall,
      declineCall,
      endCall,
      toggleMute,
      toggleSpeaker,
      handlePushIncoming,
    }}>
      {children}
      <MicPermissionModal
        visible={_micModalVisible}
        onClose={() => {
          _setMicModalVisible(false);
          // Re-check in case user dismissed after granting from OS settings
          getMicPermissionState().then((s) => setMicBlocked(s === "denied"));
        }}
      />
    </CallContext.Provider>
  );
}

// ─── Tiny UUID helper (no library needed) ─────────────────────────────────────

function _uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
