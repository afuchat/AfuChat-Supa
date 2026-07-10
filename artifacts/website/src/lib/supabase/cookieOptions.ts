/**
 * Shared-auth cookie options — MUST match artifacts/mobile/lib/supabase.ts
 * (web branch) and artifacts/afuchat-website/src/lib/supabase.ts exactly.
 * A session created on afuchat.com, web.afuchat.com, or desktop.afuchat.com
 * is visible on all of them via a `.afuchat.com`-scoped cookie.
 * See docs: shared-auth-with-web-app.md.
 */
export function isProdHost(hostname: string): boolean {
  return hostname === "afuchat.com" || hostname.endsWith(".afuchat.com");
}

export function cookieOptionsFor(hostname: string) {
  const prod = isProdHost(hostname);
  return {
    domain: prod ? ".afuchat.com" : undefined,
    path: "/",
    sameSite: "lax" as const,
    secure: prod,
  };
}
