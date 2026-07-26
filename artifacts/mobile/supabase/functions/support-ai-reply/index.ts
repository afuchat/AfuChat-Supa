// support-ai-reply — Engagera-powered support ticket auto-responder.
//
// Called directly by the client (via supabase.functions.invoke) immediately
// after the user submits a support ticket and its first message.
//
// Flow:
//   1. Verify the caller is authenticated (JWT required).
//   2. Fetch the ticket + all user messages for context.
//   3. Build a focused system prompt based on the ticket category.
//   4. Call Engagera AI for a helpful, tailored draft reply.
//   5. Insert the reply as a `sender_type = "ai"` message.
//   6. Set `has_ai_draft = true` on the ticket.
//
// Required secrets (set via `supabase secrets set`):
//   ENGAGERA_API_KEY   — Engagera API key
//   SUPABASE_SERVICE_ROLE_KEY is auto-injected by the Supabase runtime.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ENGAGERA_API_KEY  = Deno.env.get("ENGAGERA_API_KEY") ?? "";
const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")     ?? "";
const SERVICE_ROLE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ENGAGERA_BASE     = `${SUPABASE_URL}/functions/v1`;

// ─── Category-aware hints for the system prompt ──────────────────────────────
const CATEGORY_HINTS: Record<string, string> = {
  account:     "The user has an account or login issue. Help them recover access, reset credentials, or explain account-related settings.",
  payments:    "The user has a payments or ACoins issue. Be clear about what you can verify and advise on refund timelines (7 days, case-by-case).",
  marketplace: "The user has an AfuMarket or order issue. Explain the escrow process and typical resolution steps.",
  messages:    "The user has a messaging issue. Troubleshoot connectivity, media sharing, or encryption concerns.",
  content:     "The user has a content, post, or story issue. Explain moderation policies or technical limitations.",
  safety:      "The user has a safety or privacy concern. Be empathetic and direct them to the correct escalation path.",
  technical:   "The user has a technical issue (crash, bug, or performance problem). Ask for device info if missing and explain next steps.",
  general:     "The user has a general question or feedback. Be friendly and informative.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    // ── 1. Auth check ────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!ENGAGERA_API_KEY) {
      console.error("[support-ai-reply] ENGAGERA_API_KEY secret not set");
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { ticket_id } = await req.json();
    if (!ticket_id) {
      return new Response(JSON.stringify({ error: "ticket_id is required" }), {
        status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── 2. Fetch ticket + messages (using service role to bypass RLS) ────────
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const [{ data: ticket }, { data: messages }] = await Promise.all([
      admin
        .from("support_tickets")
        .select("id, subject, category, priority, has_ai_draft")
        .eq("id", ticket_id)
        .single(),
      admin
        .from("support_messages")
        .select("sender_type, message")
        .eq("ticket_id", ticket_id)
        .eq("is_internal", false)
        .order("created_at", { ascending: true }),
    ]);

    if (!ticket) {
      return new Response(JSON.stringify({ error: "Ticket not found" }), {
        status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Skip if AI already drafted a reply (idempotency guard)
    if (ticket.has_ai_draft) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Build the user conversation for context
    const userMessages = (messages ?? []).filter((m) => m.sender_type === "user");
    if (!userMessages.length) {
      return new Response(JSON.stringify({ error: "No user messages yet" }), {
        status: 422, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── 3. Build AI prompt ───────────────────────────────────────────────────
    const categoryHint = CATEGORY_HINTS[ticket.category ?? "general"] ?? CATEGORY_HINTS.general;
    const isPriority   = ticket.priority === "urgent" || ticket.priority === "high";

    const systemPrompt = `You are a helpful, professional customer support agent for AfuChat — a mobile social and messaging platform.

${categoryHint}

Guidelines:
- Be warm, concise, and solution-focused. Keep replies under 200 words unless more detail is clearly needed.
- If you can resolve the issue immediately, do so with clear steps.
- If you need more information, ask ONE specific clarifying question.
- If the issue requires a human agent, acknowledge the problem, set expectations (human follow-up within 2–4 hours), and provide any self-help steps the user can take now.
- Never make up specific order IDs, amounts, or account details you cannot verify.
- Sign off as "AfuChat Support AI" — never claim to be human.
${isPriority ? "- This ticket is marked as high/urgent priority. Acknowledge the urgency and reassure the user their issue is escalated." : ""}

Ticket subject: "${ticket.subject}"
Category: ${ticket.category ?? "general"}`;

    // Pass the conversation thread so AI has full context
    const engMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      ...userMessages.map((m) => ({ role: "user", content: m.message })),
    ];

    // ── 4. Call Engagera ─────────────────────────────────────────────────────
    const engRes = await fetch(`${ENGAGERA_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-engagera-api-key": ENGAGERA_API_KEY,
      },
      body: JSON.stringify({
        messages: engMessages,
        model: "engagera-pro",
        stream: false,
      }),
    });

    if (!engRes.ok) {
      const errText = await engRes.text().catch(() => "");
      console.error("[support-ai-reply] Engagera error:", engRes.status, errText);
      return new Response(JSON.stringify({ error: "AI service unavailable" }), {
        status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const engData  = await engRes.json();
    const aiReply: string = (engData.message?.content ?? engData.content ?? "").trim();

    if (!aiReply) {
      console.error("[support-ai-reply] Empty AI response");
      return new Response(JSON.stringify({ error: "AI returned empty response" }), {
        status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // ── 5. Insert AI reply + mark ticket ────────────────────────────────────
    await Promise.all([
      admin.from("support_messages").insert({
        ticket_id,
        sender_id:   null,
        sender_type: "ai",
        message:     aiReply,
        is_internal: false,
      }),
      admin.from("support_tickets").update({ has_ai_draft: true }).eq("id", ticket_id),
    ]);

    return new Response(JSON.stringify({ ok: true, reply: aiReply }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("[support-ai-reply] Unhandled error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
