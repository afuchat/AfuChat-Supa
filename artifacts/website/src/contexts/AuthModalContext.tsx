"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

export type AuthMode = "signin" | "signup";

export type AuthReason =
  | "like"
  | "reply"
  | "share"
  | "chat"
  | "follow"
  | "profile"
  | "default";

const REASON_COPY: Record<AuthReason, { headline: string; sub: string }> = {
  like:    { headline: "Like this post",         sub: "Join AfuChat to like, comment and follow creators." },
  reply:   { headline: "Join the conversation",  sub: "Sign in to reply and connect with the community." },
  share:   { headline: "Share with your network",sub: "Create an account to share posts with your followers." },
  chat:    { headline: "Start a conversation",   sub: "Sign in to send messages and connect privately." },
  follow:  { headline: "Follow this creator",    sub: "Join AfuChat to follow people and personalise your feed." },
  profile: { headline: "Your AfuChat profile",   sub: "Sign in to view and manage your account." },
  default: { headline: "Welcome to AfuChat",     sub: "Join millions of people connecting on AfuChat." },
};

interface AuthModalContextValue {
  openAuth: (mode?: AuthMode, reason?: AuthReason) => void;
  closeAuth: () => void;
  switchMode: (mode: AuthMode) => void;
  isOpen: boolean;
  mode: AuthMode;
  reason: AuthReason;
  copy: { headline: string; sub: string };
}

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen]   = useState(false);
  const [mode, setMode]       = useState<AuthMode>("signin");
  const [reason, setReason]   = useState<AuthReason>("default");

  // Support ?auth=signin|signup URL param to open sheet on page load
  // (used by /login redirect and share links)
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  useEffect(() => {
    const param = searchParams.get("auth");
    if (param === "signin" || param === "signup") {
      setMode(param);
      setReason("default");
      setIsOpen(true);
      // Clean the param from the URL without a navigation push
      const next = new URLSearchParams(searchParams.toString());
      next.delete("auth");
      const qs = next.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAuth = useCallback((m: AuthMode = "signin", r: AuthReason = "default") => {
    setMode(m);
    setReason(r);
    setIsOpen(true);
  }, []);

  const closeAuth   = useCallback(() => setIsOpen(false), []);
  const switchMode  = useCallback((m: AuthMode) => setMode(m), []);

  return (
    <AuthModalContext.Provider
      value={{ openAuth, closeAuth, switchMode, isOpen, mode, reason, copy: REASON_COPY[reason] }}
    >
      {children}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal(): AuthModalContextValue {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error("useAuthModal must be used within AuthModalProvider");
  return ctx;
}

export function useAuthModalOptional(): AuthModalContextValue | null {
  return useContext(AuthModalContext);
}
