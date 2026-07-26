/**
 * engagera.ts — Lazy singleton for the Engagera AI client.
 *
 * The API key is read from EXPO_PUBLIC_ENGAGERA_API_KEY (env) with a hardcoded
 * fallback, matching the same public-key pattern used for SUPABASE_ANON_KEY.
 * The key only authorises calls to this project's own /chat edge function, so
 * it is safe to ship in the client bundle (the edge function owns rate-limiting).
 */
import Engagera from "@afuchat1/engagera";
import { ENGAGERA_API_KEY } from "@/lib/env";

let _client: Engagera | null = null;

/**
 * Returns the shared Engagera client (synchronous after first call).
 */
export function getEngagera(): Engagera {
  if (!_client) {
    if (!ENGAGERA_API_KEY) throw new Error("ENGAGERA_API_KEY is not configured");
    _client = new Engagera({ apiKey: ENGAGERA_API_KEY });
  }
  return _client;
}
