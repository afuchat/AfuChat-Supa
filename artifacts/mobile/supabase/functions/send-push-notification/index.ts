/**
 * send-push-notification — DEPRECATED / NO-OP
 * ─────────────────────────────────────────────────────────────────────────────
 * Push notification dispatch is now handled entirely server-side by DB triggers
 * calling the push-notification-trigger edge function.
 *
 * This endpoint is kept as a 200 no-op so any stale client calls do not
 * produce 404 errors in logs. It can be removed after confirming no callers.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }
  return new Response(JSON.stringify({ ok: true, deprecated: true }), {
    status: 200,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});
