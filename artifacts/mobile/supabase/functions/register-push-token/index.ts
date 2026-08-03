/**
 * register-push-token
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores or updates a user's FCM push token in their profile row.
 *
 * POST body: { token: string, platform: "ios" | "android" }
 * Auth: Bearer <user JWT> (Supabase auth header)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey     = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await anonClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Parse body
    const body = await req.json().catch(() => ({}));
    const { token, platform } = body as { token?: string; platform?: string };

    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "token is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceKey);

    // "__clear__" is a sentinel sent on sign-out to remove the stored token.
    const isClear = token.trim() === "" || token === "__clear__";

    // Update fcm_token on the user's profile
    const { error: profileErr } = await serviceClient
      .from("profiles")
      .update({
        fcm_token: isClear ? null : token.trim(),
        push_token_platform: isClear ? null : (platform ?? null),
        push_token_updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (isClear) {
      return new Response(JSON.stringify({ ok: true, cleared: true }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (profileErr) {
      console.error("[register-push-token] profile update failed:", profileErr.message);
      return new Response(JSON.stringify({ error: profileErr.message }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Ensure notification_preferences row exists with push_enabled = true
    await serviceClient
      .from("notification_preferences")
      .upsert(
        {
          user_id: user.id,
          push_enabled: true,
          push_messages: true,
          push_likes: true,
          push_follows: true,
          push_mentions: true,
          push_comments: true,
        },
        { onConflict: "user_id", ignoreDuplicates: true },
      );

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[register-push-token] unhandled error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
