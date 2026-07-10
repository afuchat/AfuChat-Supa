"use client";

import { useState, type FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import Logo from "../../components/Logo";

function LoginForm() {
  const params = useSearchParams();
  const initialMode = params.get("mode") === "signup" ? "signup" : "signin";
  const nextPath = params.get("next") ?? "/feed";

  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
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
      router.push(nextPath);
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
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <Logo size={44} />
          <span className="text-2xl font-bold tracking-tight">
            Afu<span className="text-[#1f95ff]">Chat</span>
          </span>
          <p className="text-sm text-[#5a5040]">The social super-app</p>
        </div>

        <div className="rounded-2xl border border-[#ddd7c9] bg-[#ede8dc] p-8 shadow-sm">
          <h1 className="mb-1 text-xl font-semibold text-[#000]">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mb-6 text-sm text-[#5a5040]">
            {mode === "signin"
              ? "Sign in to your AfuChat account."
              : "Same account works on mobile and desktop."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[#ddd7c9] bg-[#f5f0e8] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#1f95ff] focus:ring-2 focus:ring-[#1f95ff]/20"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[#ddd7c9] bg-[#f5f0e8] px-3.5 py-2.5 text-sm outline-none transition focus:border-[#1f95ff] focus:ring-2 focus:ring-[#1f95ff]/20"
            />

            {error && (
              <p className={`rounded-lg p-3 text-sm ${error.includes("Check your email") ? "bg-green-50 text-green-700" : "bg-red-50 text-[#ff3b30]"}`}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-[#1f95ff] py-2.5 text-sm font-semibold text-white transition hover:bg-[#1a7fd4] disabled:opacity-50"
            >
              {submitting ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <button
              onClick={() => {
                setError(null);
                setMode(mode === "signin" ? "signup" : "signin");
              }}
              className="text-sm text-[#5a5040] hover:text-[#000] underline-offset-2 hover:underline"
            >
              {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-[#8c7f6a]">
          By continuing you agree to AfuChat&apos;s Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
