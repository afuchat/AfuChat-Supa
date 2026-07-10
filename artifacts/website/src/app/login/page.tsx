"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { createClient } from "../../lib/supabase/client";

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
    <div className="flex min-h-screen items-center justify-center bg-[#f5f6f8] px-4">
      <div className="w-full max-w-sm rounded-2xl border border-black/5 bg-white p-8 shadow-sm">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
            <MessageCircle size={18} strokeWidth={2.5} />
          </div>
          <span className="text-lg font-semibold">
            Afu<span className="text-brand">Chat</span>
          </span>
        </div>

        <h1 className="mb-1 text-xl font-semibold text-[#14161a]">
          {mode === "signin" ? "Sign in to your workspace" : "Create your account"}
        </h1>
        <p className="mb-6 text-sm text-[#6b7280]">
          {mode === "signin" ? "Use your AfuChat account." : "Same account works on mobile and desktop."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-black/10 px-3 py-2.5 text-sm outline-none focus:border-brand"
          />

          {error && <p className="text-sm text-red-500">{error}</p>}

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
          className="mt-4 w-full text-center text-sm text-[#6b7280] hover:text-[#14161a]"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
