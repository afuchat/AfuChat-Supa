/**
 * register-push-token
 * ─────────────────────────────────────────────────────────────────────────────
 * Stores or updates a user's native FCM/APNs token and Expo push token.
 *
 * POST body: {
 *   fcmToken?: string,
 *   expoPushToken?: string,
 *   token?: string, // legacy alias for fcmToken
 *   platform: "ios" | "android"
 * }
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
    const { token, fcmToken, expoPushToken, platform } = body as {
      token?: string;
      fcmToken?: string | null;
      expoPushToken?: string | null;
      platform?: string;
    };

    const hasFcmToken = Object.prototype.hasOwnProperty.call(body, "fcmToken") ||
      Object.prototype.hasOwnProperty.call(body, "token");
    const hasExpoToken = Object.prototype.hasOwnProperty.call(body, "expoPushToken");
    const nativeToken = fcmToken ?? token ?? null;
    const isClear = nativeToken === "__clear__" || expoPushToken === "__clear__";
    const cleanFcmToken = isClear
      ? null
      : typeof nativeToken === "string" && nativeToken.trim()
        ? nativeToken.trim()
        : null;
    const cleanExpoToken = isClear
      ? null
      : typeof expoPushToken === "string" && expoPushToken.trim()
        ? expoPushToken.trim()
        : null;

    if (platform === "ios" && !cleanExpoToken && !isClear) {
      return new Response(JSON.stringify({
        error: "iOS registration requires an Expo push token until direct APNs delivery is configured",
      }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!cleanFcmToken && !cleanExpoToken && !isClear) {
      return new Response(JSON.stringify({ error: "fcmToken or expoPushToken is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, serviceKey);

    // Keep the channels separate so Expo Go and standalone builds can coexist.
    // Only update channels explicitly supplied by the client; a token refresh
    // must not erase the other working delivery route.
    const profileUpdate: Record<string, unknown> = {
      push_token_updated_at: new Date().toISOString(),
    };
    if (isClear || hasFcmToken) {
      profileUpdate.fcm_token = cleanFcmToken;
    }
    if (isClear || hasExpoToken) {
      profileUpdate.expo_push_token = cleanExpoToken;
    }
    if (isClear || platform) {
      profileUpdate.push_token_platform = isClear ? null : (platform ?? null);
    }

    const { error: profileErr } = await serviceClient
      .from("profiles")
      .update(profileUpdate)
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

    // Ensure notification_preferences row exists.
    // INSERT only — do not overwrite existing user preferences on every token refresh.
    await serviceClient.rpc("ensure_notification_preferences", { p_user_id: user.id });

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
