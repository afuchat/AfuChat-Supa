"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X, Mail, Lock, Eye, EyeOff, ArrowRight, Sparkles } from "lucide-react";
import { createClient } from "../../lib/supabase/client";
import { useAuthModal } from "../../contexts/AuthModalContext";
import { useAuth } from "../../contexts/AuthContext";
import Logo from "../Logo";

// ─── tiny helpers ────────────────────────────────────────────────────────────

function InputField({
  label, id, type = "text", value, onChange, placeholder, autoComplete,
  right,
}: {
  label: string; id: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string; autoComplete?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-semibold uppercase tracking-widest text-[#8c7f6a]">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={type}
          value={value}
          autoComplete={autoComplete}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-[#ddd7c9] bg-[#f5f0e8] px-4 py-3 text-sm text-[#000] placeholder:text-[#b0a898] outline-none transition
            focus:border-[#1f95ff] focus:ring-2 focus:ring-[#1f95ff]/15"
        />
        {right && (
          <div className="absolute inset-y-0 right-3 flex items-center">{right}</div>
        )}
      </div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="relative flex items-center gap-3 py-1">
      <div className="flex-1 border-t border-[#ddd7c9]" />
      <span className="text-[11px] font-medium text-[#b0a898]">{label}</span>
      <div className="flex-1 border-t border-[#ddd7c9]" />
    </div>
  );
}

// ─── main sheet ──────────────────────────────────────────────────────────────

export default function AuthSheet() {
  const { isOpen, mode, reason, copy, closeAuth, switchMode } = useAuthModal();
  const { user } = useAuth();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [name, setName]         = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [busy, setBusy]         = useState(false);
  const [done, setDone]         = useState(false); // post-signup confirm state

  const overlayRef  = useRef<HTMLDivElement>(null);
  const supabase    = createClient();

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAuth();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeAuth]);

  // Close if user becomes authenticated
  useEffect(() => {
    if (user && isOpen) closeAuth();
  }, [user, isOpen, closeAuth]);

  // Reset form when sheet opens/mode changes
  useEffect(() => {
    if (isOpen) {
      setEmail(""); setPassword(""); setName("");
      setError(null); setDone(false); setBusy(false);
    }
  }, [isOpen, mode]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    if (mode === "signin") {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (err) setError(err.message);
      // success → useEffect above closes sheet
    } else {
      const { error: err } = await supabase.auth.signUp({
        email, password,
        options: { data: { display_name: name } },
      });
      setBusy(false);
      if (err) setError(err.message);
      else setDone(true);
    }
  }

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [isOpen]);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        ref={overlayRef}
        onClick={closeAuth}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0, pointerEvents: isOpen ? "auto" : "none" }}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in to AfuChat"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[440px] flex-col bg-[#f5f0e8] shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ transform: isOpen ? "translateX(0)" : "translateX(100%)" }}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between border-b border-[#ddd7c9] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Logo size={26} />
            <span className="text-[15px] font-bold tracking-tight">
              Afu<span className="text-[#1f95ff]">Chat</span>
            </span>
          </div>
          <button
            onClick={closeAuth}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#8c7f6a] transition hover:bg-[#e8e2d6] hover:text-[#000]"
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-8">
          {done ? (
            <ConfirmEmailState email={email} onClose={closeAuth} />
          ) : (
            <>
              {/* Context headline */}
              <ContextHero reason={reason} copy={copy} mode={mode} />

              {/* Mode tabs */}
              <ModeTabs mode={mode} onSwitch={switchMode} />

              {/* Form */}
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {mode === "signup" && (
                  <InputField
                    label="Display name" id="auth-name"
                    value={name} onChange={setName}
                    placeholder="Your name" autoComplete="name"
                  />
                )}
                <InputField
                  label="Email" id="auth-email" type="email"
                  value={email} onChange={setEmail}
                  placeholder="you@example.com" autoComplete="email"
                />
                <InputField
                  label="Password" id="auth-password"
                  type={showPw ? "text" : "password"}
                  value={password} onChange={setPassword}
                  placeholder={mode === "signup" ? "Min 8 characters" : "Your password"}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  right={
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      className="text-[#8c7f6a] hover:text-[#000] transition"
                      aria-label={showPw ? "Hide password" : "Show password"}
                    >
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  }
                />

                {error && (
                  <p className="rounded-xl bg-red-50 px-4 py-3 text-xs font-medium text-red-600 border border-red-100">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy || !email || !password || (mode === "signup" && !name)}
                  className="group relative w-full overflow-hidden rounded-xl bg-[#1f95ff] px-4 py-3.5 text-sm font-bold text-white transition
                    hover:bg-[#1a7fd4] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="flex items-center justify-center gap-2">
                    {busy ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    ) : (
                      <>
                        {mode === "signin" ? "Sign in" : "Create account"}
                        <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </span>
                </button>

                {mode === "signin" && (
                  <p className="text-center text-xs text-[#8c7f6a]">
                    <button type="button" className="underline underline-offset-2 hover:text-[#000] transition">
                      Forgot password?
                    </button>
                  </p>
                )}
              </form>

              <Divider label="or" />

              {/* Social stubs */}
              <SocialButtons />

              {/* Switch mode link */}
              <p className="mt-6 text-center text-xs text-[#8c7f6a]">
                {mode === "signin" ? (
                  <>
                    No account?{" "}
                    <button
                      onClick={() => switchMode("signup")}
                      className="font-semibold text-[#1f95ff] hover:underline"
                    >
                      Create one free
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      onClick={() => switchMode("signin")}
                      className="font-semibold text-[#1f95ff] hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#ddd7c9] px-6 py-4">
          <p className="text-center text-[10px] text-[#b0a898]">
            By continuing you agree to AfuChat&apos;s{" "}
            <a href="#" className="underline hover:text-[#5a5040]">Terms</a>
            {" "}and{" "}
            <a href="#" className="underline hover:text-[#5a5040]">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </>
  );
}

// ─── sub-components ──────────────────────────────────────────────────────────

function ContextHero({
  reason, copy, mode,
}: {
  reason: string;
  copy: { headline: string; sub: string };
  mode: AuthMode;
}) {
  // Show a subtle contextual chip for non-default reasons
  const isContextual = reason !== "default";
  return (
    <div className="mb-6">
      {isContextual && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-[#1f95ff]/10 px-3 py-1 text-xs font-semibold text-[#1f95ff]">
          <Sparkles size={11} />
          {copy.headline}
        </div>
      )}
      <h2 className="text-2xl font-bold tracking-tight text-[#000]">
        {isContextual ? copy.sub.split(".")[0] : (mode === "signin" ? "Welcome back" : "Join AfuChat")}
      </h2>
      <p className="mt-1 text-sm text-[#8c7f6a]">
        {isContextual
          ? (mode === "signin" ? "Sign in to continue." : "Create a free account to continue.")
          : (mode === "signin"
            ? "Sign in to access your chats, feed, and profile."
            : "Connect with creators. Build your network. Earn rewards.")}
      </p>
    </div>
  );
}

type AuthMode = "signin" | "signup";

function ModeTabs({ mode, onSwitch }: { mode: AuthMode; onSwitch: (m: AuthMode) => void }) {
  return (
    <div className="flex rounded-xl border border-[#ddd7c9] bg-[#ede8dc] p-1">
      {(["signin", "signup"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onSwitch(m)}
          className={`flex-1 rounded-lg py-2 text-xs font-bold transition-all duration-200 ${
            mode === m
              ? "bg-white text-[#000] shadow-sm"
              : "text-[#8c7f6a] hover:text-[#5a5040]"
          }`}
        >
          {m === "signin" ? "Sign in" : "Create account"}
        </button>
      ))}
    </div>
  );
}

function SocialButtons() {
  return (
    <div className="mt-4">
      <SocialBtn icon={<GoogleIcon />} label="Continue with Google" />
    </div>
  );
}

function SocialBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-xl border border-[#ddd7c9] bg-white px-4 py-3 text-sm font-medium text-[#000] transition hover:bg-[#f9f6f0] hover:border-[#c8c0b4]"
    >
      <span className="flex-none">{icon}</span>
      {label}
    </button>
  );
}

function ConfirmEmailState({ email, onClose }: { email: string; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#1f95ff]/10 text-[#1f95ff]">
        <Mail size={30} />
      </div>
      <h2 className="mb-2 text-xl font-bold text-[#000]">Check your email</h2>
      <p className="text-sm text-[#5a5040]">
        We sent a confirmation link to{" "}
        <span className="font-semibold text-[#000]">{email}</span>.
        <br />Open it to activate your account.
      </p>
      <button
        onClick={onClose}
        className="mt-8 rounded-xl bg-[#1f95ff] px-8 py-3 text-sm font-bold text-white hover:bg-[#1a7fd4] transition"
      >
        Got it
      </button>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}
