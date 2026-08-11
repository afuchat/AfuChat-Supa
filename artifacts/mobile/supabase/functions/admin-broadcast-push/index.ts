/**
 * admin-broadcast-push
 * ─────────────────────────────────────────────────────────────────────────────
 * Sends a push notification to all users (or a filtered subset).
 *
 * POST body:
 *   {
 *     title: string,
 *     body: string,
 *     data?: Record<string, string>,
 *     filter?: "all" | "premium",   // default: "all"
 *     adminSecret: string           // must match ADMIN_BROADCAST_SECRET env var
 *   }
 *
 * Required Supabase secrets:
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_SERVICE_ACCOUNT_KEY
 *   ADMIN_BROADCAST_SECRET   (set any strong random string)
 *
 * Sends in batches of 50 with a 100ms delay between batches to avoid
 * FCM rate limits.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── FCM HTTP v1 (inlined) ─────────────────────────────────────────────────────

function b64url(data: Uint8Array | string): string {
  const str = typeof data === "string" ? data : String.fromCharCode(...(data as Uint8Array));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

async function getFCMToken(saJson: string): Promise<string> {
  const sa = JSON.parse(saJson);
  const now = Math.floor(Date.now() / 1000);
  const header  = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const si = `${header}.${payload}`;
  const pem = (sa.private_key as string).replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)).buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(si));
  const jwt = `${si}.${b64url(new Uint8Array(sig))}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("[FCM] OAuth2 failed: " + JSON.stringify(d));
  return d.access_token as string;
}

async function sendOneFCM(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
  projectId: string,
  accessToken: string,
): Promise<"ok" | "stale" | "error"> {
  const message = {
    token,
    notification: { title, body },
    android: {
      priority: "high",
      ttl: "604800s",
      notification: {
        channel_id: "default",
        sound: "default",
        notification_priority: "PRIORITY_HIGH",
        default_sound: true,
        color: "#1f95ff",
      },
    },
    apns: {
      headers: { "apns-priority": "10" },
      payload: { aps: { alert: { title, body }, sound: "default", badge: 1 } },
    },
    data,
  };

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ message }),
      },
    );

    const text = res.ok ? "" : await res.text();
    if (
      res.status === 404 ||
      text.includes("UNREGISTERED") ||
      text.includes("registration-token-not-registered")
    ) return "stale";
    if (!res.ok) {
      console.error(`[FCM broadcast] ${res.status}`, text.slice(0, 500));
      return "error";
    }
    return "ok";
  } catch (err) {
    console.error("[FCM broadcast] provider exception:", err);
    return "error";
  }
}

// ── Expo push fallback ────────────────────────────────────────────────────────

async function sendOneExpo(
  token: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<boolean> {
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ to: token, title, body, data, sound: "default", priority: "high" }),
  });
  const payload = await res.json().catch(() => null);
  return res.ok && payload?.data?.status !== "error" && !payload?.data?.details?.error;
}

// ── Main ──────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const body = await req.json();
    const { title, body: msgBody, data = {}, filter = "all", adminSecret } = body as {
      title: string;
      body: string;
      data?: Record<string, string>;
      filter?: string;
      adminSecret?: string;
    };

    // Verify admin secret
    const expectedSecret = Deno.env.get("ADMIN_BROADCAST_SECRET");
    if (!expectedSecret || adminSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!title || !msgBody) {
      return new Response(JSON.stringify({ error: "title and body are required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const projectId = Deno.env.get("FIREBASE_PROJECT_ID") || null;
    const saKey     = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY") || null;

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch all registered delivery tokens.
    let query = db
      .from("profiles")
      .select("fcm_token, expo_push_token, push_token_platform")
      .or("fcm_token.not.is.null,expo_push_token.not.is.null");
    if (filter === "premium") {
      query = query.not("platinum_until", "is", null).gt("platinum_until", new Date().toISOString());
    }
    const { data: profiles, error: dbErr } = await query;
    if (dbErr) throw new Error(dbErr.message);

    const tokens = (profiles ?? []).flatMap((p: any) => {
      const result: Array<{ token: string; kind: "fcm" | "expo" }> = [];
      if (p.expo_push_token) {
        result.push({ token: p.expo_push_token, kind: "expo" });
      }
      // The client stores an APNs token in fcm_token on older iOS builds.
      // Never send that token to FCM; use the Expo token for iOS instead.
      if (p.fcm_token && p.push_token_platform !== "ios") {
        result.push({ token: p.fcm_token, kind: "fcm" });
      }
      return result;
    });
    if (!tokens.length) {
      return new Response(JSON.stringify({ ok: true, sent: 0, skipped: 0 }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    let accessToken: string | null = null;
    if (projectId && saKey) {
      try {
        accessToken = await getFCMToken(saKey);
      } catch (err) {
        // Expo tokens remain usable if Firebase credentials are invalid or
        // temporarily unavailable.
        console.error("[admin-broadcast-push] FCM credential initialization failed:", err);
      }
    }
    const broadcastData = { ...data, type: "broadcast" };

    let sent = 0;
    let stale = 0;
    let errors = 0;
    const BATCH = 50;

    for (let i = 0; i < tokens.length; i += BATCH) {
      const batch = tokens.slice(i, i + BATCH);

      await Promise.all(
        batch.map(async ({ token, kind }) => {
          if (kind === "expo" || token.startsWith("ExponentPushToken[")) {
            if (await sendOneExpo(token, title, msgBody, broadcastData)) sent++;
            else errors++;
            return;
          }

          if (!projectId || !accessToken) {
            errors++;
            return;
          }

          const result = await sendOneFCM(token, title, msgBody, broadcastData, projectId, accessToken);
          if (result === "ok") {
            sent++;
          } else if (result === "stale") {
            stale++;
            // The token may have rotated while the app was offline. Remove
            // only this exact value so a newer registration is preserved.
            await db
              .from("profiles")
              .update({ fcm_token: null })
              .eq("fcm_token", token);
          } else {
            errors++;
          }
        }),
      );

      // Throttle between batches
      if (i + BATCH < tokens.length) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }

    console.log(`[broadcast] total=${tokens.length} sent=${sent} stale=${stale} errors=${errors}`);

    return new Response(JSON.stringify({ ok: true, total: tokens.length, sent, stale, errors }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[admin-broadcast-push] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
