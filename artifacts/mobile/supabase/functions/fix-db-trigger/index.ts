/**
 * fix-db-trigger — ONE-TIME use function
 * Fixes the push_on_message_insert trigger that references the non-existent
 * message_type column, causing all message inserts to fail (PG error 42703).
 *
 * Invoke with:
 *   curl -X POST https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/fix-db-trigger \
 *     -H "Authorization: Bearer <anon_key>" \
 *     -H "Content-Type: application/json"
 *
 * DELETE this function after running it once.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FIX_SQL = `
CREATE OR REPLACE FUNCTION _private.push_on_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  -- messages table uses encrypted_content (no message_type column).
  IF NEW.encrypted_content IS NULL AND NEW.attachment_url IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM _private.call_push_trigger(
    jsonb_build_object(
      'type',       'INSERT',
      'table',      'messages',
      'schema',     'public',
      'record',     to_jsonb(NEW),
      'old_record', NULL
    )
  );
  RETURN NEW;
END;
$$;
`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const supabaseUrl     = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: "No service role key" }), {
        status: 503, headers: { ...CORS, "Content-Type": "application/json" }
      });
    }

    // Use pg-meta to run the DDL
    const r = await fetch(`${supabaseUrl}/pg-meta/v1/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: FIX_SQL }),
    });

    const body = await r.text();
    return new Response(JSON.stringify({ status: r.status, result: body }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" }
    });
  }
});
