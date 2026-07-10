"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import Logo from "../../components/Logo";

export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      setSubmitting(false);
      if (signInError) {
        setError(signInError.message);
        return;
      }
      router.push("/chats");
      router.refresh();
      return;
    }

    const { error: signUpError } = await supabase.auth.signUp({ email, password });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setError("Check your email to confirm your account, then sign in.");
    setMode("signin");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border/60 bg-bg-secondary p-8 shadow-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <Logo size={36} />
          <span className="text-lg font-semibold">
            Afu<span className="text-brand">Chat</span>
          </span>
        </div>

        <h1 className="mb-1 text-xl font-semibold text-text">
          {mode === "signin" ? "Sign in to your workspace" : "Create your account"}
        </h1>
        <p className="mb-6 text-sm text-text-secondary">
          {mode === "signin" ? "Use your AfuChat account." : "Same account works on mobile and desktop."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-2.5 text-sm outline-none focus:border-brand"
          />

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          onClick={() => {
            setError(null);
            setMode(mode === "signin" ? "signup" : "signin");
          }}
          className="mt-4 w-full text-center text-sm text-text-secondary hover:text-text"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
