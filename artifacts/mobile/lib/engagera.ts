/**
 * engagera.ts — Lazy singleton for the Engagera AI client.
 *
 * The API key is stored in Supabase `app_settings.engagera_api_key` so it
 * never ships in the client bundle.  The first call to `getEngagera()` fetches
 * the key and caches the client for the lifetime of the JS context.
 */
import Engagera from "@afuchat1/engagera";
import { supabase } from "@/lib/supabase";

let _client: Engagera | null = null;
let _initPromise: Promise<Engagera> | null = null;

async function _init(): Promise<Engagera> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("engagera_api_key")
    .limit(1)
    .maybeSingle();

  if (error || !data?.engagera_api_key) {
    throw new Error("Engagera API key not found in app_settings");
  }

  _client = new Engagera({ apiKey: data.engagera_api_key });
  return _client;
}

/**
 * Returns the shared Engagera client, initialising it on the first call.
 * Concurrent callers share the same in-flight promise.
 */
export async function getEngagera(): Promise<Engagera> {
  if (_client) return _client;
  if (!_initPromise) _initPromise = _init().finally(() => { _initPromise = null; });
  return _initPromise;
}
