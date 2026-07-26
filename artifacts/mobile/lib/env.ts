/**
 * env.ts — single source of truth for all public runtime constants.
 *
 * The website works with ZERO environment variables set.
 * EXPO_PUBLIC_* vars are still read first so local dev overrides keep working,
 * but every constant has a hardcoded production fallback so no build-time env
 * injection is needed on Vercel or any other host.
 *
 * Rules:
 *  - Never add secrets here (no service-role keys, no private tokens).
 *  - Supabase URL + anon key are intentionally public (Supabase RLS guards data).
 *  - Import from this file; never call process.env.EXPO_PUBLIC_* elsewhere.
 */

export const SUPABASE_URL: string =
  (process.env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim() ||
  "https://rhnsjqqtdzlkvqazfcbg.supabase.co";

export const SUPABASE_ANON_KEY: string =
  (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim() ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY";

export const APP_DOMAIN: string =
  (process.env.EXPO_PUBLIC_DOMAIN ?? "").trim() || "afuchat.com";

export const APP_ORIGIN: string = `https://${APP_DOMAIN}`;

export const SUPABASE_EDGE_URL: string = `${SUPABASE_URL}/functions/v1`;

/**
 * Engagera API key — authorises calls to the /chat edge function on this
 * Supabase project. Intentionally public (same security model as the anon
 * key — the edge function owns rate-limiting and auth).
 */
export const ENGAGERA_API_KEY: string =
  (process.env.EXPO_PUBLIC_ENGAGERA_API_KEY ?? "").trim() ||
  "eng_2ed3f056425528efe6685e1d5f833a2b25910ae83c32f090a2320e8b298a2ca7";
