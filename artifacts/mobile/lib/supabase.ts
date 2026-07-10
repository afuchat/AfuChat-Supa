import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";
import { Platform } from "react-native";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./env";

// ─── Shared-auth cookie domain (web only) ───────────────────────────────────
// Mirrors artifacts/afuchat-website/src/lib/supabase.ts EXACTLY so a session
// created on afuchat.com (marketing site) or web.afuchat.com (this app, when
// exported to web) is visible on both — see
// docs: shared-auth-with-web-app.md.
//
// The cookie domain must only be set when actually running on a real
// afuchat.com subdomain; on localhost/preview/staging hosts (e.g. Replit dev
// domains) leave it unset so the browser doesn't reject the cookie.
function isProdHost(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  const host = window.location?.hostname ?? "";
  return host === "afuchat.com" || host.endsWith(".afuchat.com");
}

export const supabaseUrl = SUPABASE_URL;
export const supabaseAnonKey = SUPABASE_ANON_KEY;

// ─── Suppress expected Supabase refresh-token errors ────────────────────────
// When the app starts with a stale/revoked refresh token in storage, Supabase
// calls console.error with an AuthApiError before firing SIGNED_OUT via
// onAuthStateChange.  AuthContext already handles the SIGNED_OUT event
// gracefully (it restores the session from SecureStore without touching React
// state), so this console.error is purely noise.  We intercept and drop it
// here — at the earliest possible point before Expo Router's log middleware
// picks it up — rather than letting it appear as a red error to developers or
// get swallowed by crash reporters as a false positive.
//
// The filter is intentionally narrow: it only matches objects tagged with
// Supabase's own __isAuthError flag AND the specific refresh_token_not_found
// code.  All other errors are passed through unchanged.
if (typeof console !== "undefined" && typeof console.error === "function") {
  const _originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (
      first !== null &&
      first !== undefined &&
      typeof first === "object" &&
      (first as Record<string, unknown>).__isAuthError === true &&
      (
        (first as Record<string, unknown>).code === "refresh_token_not_found" ||
        String((first as Record<string, unknown>).message ?? "").toLowerCase().includes("refresh token not found")
      )
    ) {
      return;
    }
    // Also filter the string form that some Supabase versions log
    if (typeof first === "string" && first.toLowerCase().includes("refresh token not found")) {
      return;
    }
    _originalConsoleError(...args);
  };
}

export const supabase =
  Platform.OS === "web"
    ? createBrowserClient(supabaseUrl, supabaseAnonKey, {
        cookieOptions: {
          domain: isProdHost() ? ".afuchat.com" : undefined,
          path: "/",
          sameSite: "lax",
          secure: isProdHost(),
        },
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
          flowType: "pkce",
        },
        realtime: {
          heartbeatIntervalMs: 15_000,
          reconnectAfterMs: (tries: number) => Math.min(500 * tries, 5_000),
        },
      })
    : createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
          flowType: "pkce",
        },
        realtime: {
          heartbeatIntervalMs: 15_000,
          reconnectAfterMs: (tries: number) => Math.min(500 * tries, 5_000),
        },
      });
