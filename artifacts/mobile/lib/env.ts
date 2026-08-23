/**
 * env.ts — single source of truth for all public runtime constants.
 *
 * Public runtime values are read from environment variables so credentials are
 * not committed to the repository or bundled as undocumented fallbacks.
 *
 * Rules:
 *  - Never add secrets here (no service-role keys, private tokens, or provider keys).
 *  - Supabase URL + anon key are intentionally public (Supabase RLS guards data).
 *  - Import from this file; never call process.env.EXPO_PUBLIC_* elsewhere.
 */

export const SUPABASE_URL: string =
  (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim() ||
  "https://rhnsjqqtdzlkvqazfcbg.supabase.co";

export const SUPABASE_ANON_KEY: string =
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();

export const APP_DOMAIN: string =
  (process.env.EXPO_PUBLIC_DOMAIN ?? "").trim() || "afuchat.com";

export const APP_ORIGIN: string = `https://${APP_DOMAIN}`;

export const SUPABASE_EDGE_URL: string = `${SUPABASE_URL}/functions/v1`;

/**
 * Engagera API key. Provider keys can carry quota or billing privileges even
 * when requests originate from a client app, so this must not be committed.
 */
export const ENGAGERA_API_KEY: string =
  (process.env.EXPO_PUBLIC_ENGAGERA_API_KEY ?? "").trim();

/**
 * Giphy public API key — used client-side for GIF search and trending.
 * Intentionally public: Giphy keys are designed to be embedded in client apps
 * (same security model as the Supabase anon key — rate-limiting is API-side).
 */
export const GIPHY_API_KEY: string =
  (process.env.EXPO_PUBLIC_GIPHY_API_KEY ?? "").trim();
