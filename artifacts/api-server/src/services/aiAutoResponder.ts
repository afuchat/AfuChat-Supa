/**
 * AI Support Auto-Responder
 *
 * Generates a draft reply for newly-created support tickets using the
 * Engagera API (engagera.afuchat.com). The draft is inserted as
 * sender_type = 'ai' so staff can review, edit, and send it — or dismiss
 * it entirely.
 */

import { logger } from "../lib/logger";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "../lib/constants";

const ENGAGERA_ENDPOINT = "https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/chat";

function getEngageraKey(): string {
  return process.env.ENGAGERA_API_KEY || "";
}

const CATEGORY_CONTEXT: Record<string, string> = {
  account: "Account & Login issues — common causes: forgotten password, phone number change, 2FA problems, account lockout, or profile recovery.",
  payments: "Payments & ACoins — common causes: failed top-up, ACoins not credited, refund request, transaction dispute, or Pesapal payment issues.",
  marketplace: "AfuMarket Orders — common causes: order not received, seller not shipping, refund request, wrong item, or escrow dispute.",
  messages: "Messaging issues — common causes: messages not sending, media not loading, disappearing messages, blocked contact, or chat encryption errors.",
  content: "Content & Posts — common causes: post not visible, story expired early, video processing failed, or content removed by moderation.",
  safety: "Safety & Privacy — common causes: harassment report, blocked user bypassing, account impersonation, data privacy request, or reporting inappropriate content.",
  technical: "Technical Issue — common causes: app crash, slow performance, push notifications not working, camera/microphone permission, or sync errors.",
  general: "General Enquiry — the user has a general question about AfuChat features, policies, or account management.",
};

function buildSystemPrompt(category: string): string {
  const ctx = CATEGORY_CONTEXT[category] || CATEGORY_CONTEXT.general;
  return `You are AfuChat Support AI, a helpful and empathetic support assistant for AfuChat — a social super-app with messaging, social posts, AfuPay (ACoins virtual currency), AfuMarket, video sharing, and AI features.

Context for this ticket category: ${ctx}

Your task: Write a helpful, warm, and professional first response to the user's support request.

Guidelines:
- Open with genuine empathy for their situation (2-3 words max, no generic "I hope this message finds you well")
- Acknowledge the specific issue they described
- Provide 2-4 actionable troubleshooting steps or information relevant to their exact problem
- If it's a payment/ACoins issue, reassure them their funds are safe
- If it's a technical issue, include at least one self-service step (restart app, clear cache, check connection)
- End with: "If this doesn't resolve your issue, our human support team will follow up shortly."
- Tone: warm, concise, helpful — like a knowledgeable friend, not a corporate bot
- Length: 80-180 words
- Do NOT use markdown headers or bullet point symbols (-, *) — use numbered steps only when listing actions
- Do NOT promise refunds or account actions — those require human review
- Sign off as: "AfuChat Support Team"`;
}

async function callEngagera(
  systemPrompt: string,
  userMessage: string,
): Promise<string | null> {
  const key = getEngageraKey();
  if (!key) {
    logger.warn("[ai-draft] ENGAGERA_API_KEY not set — skipping");
    return null;
  }

  try {
    const resp = await fetch(ENGAGERA_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "auto",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 350,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) {
      const body = await resp.text();
      logger.warn({ status: resp.status, body }, "[ai-draft] Engagera error");
      return null;
    }

    const data: any = await resp.json();
    const text = data?.message?.content?.trim();
    if (text) {
      logger.info("[ai-draft] Engagera generated draft");
      return text;
    }
  } catch (err: any) {
    logger.warn({ err: err?.message }, "[ai-draft] Engagera request failed");
  }
  return null;
}

export interface AiDraftInput {
  ticketId: string;
  subject: string;
  category: string;
  userMessage: string;
  userName?: string;
}

/**
 * Generate an AI draft reply and insert it into support_messages.
 * Returns true if a draft was successfully generated and stored.
 */
export async function generateAiDraft(input: AiDraftInput): Promise<boolean> {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    logger.warn("[ai-draft] SUPABASE_SERVICE_ROLE_KEY not set — skipping");
    return false;
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing } = await admin
    .from("support_messages")
    .select("id")
    .eq("ticket_id", input.ticketId)
    .eq("sender_type", "ai")
    .limit(1);

  if (existing && existing.length > 0) {
    logger.info({ ticketId: input.ticketId }, "[ai-draft] Draft already exists, skipping");
    return false;
  }

  const systemPrompt = buildSystemPrompt(input.category);
  const userPrompt = `Subject: ${input.subject}\n\nMessage from ${input.userName || "the user"}:\n${input.userMessage}`;

  let draft: string | null = null;

  try {
    draft = await callEngagera(systemPrompt, userPrompt);
  } catch (err) {
    logger.error({ err }, "[ai-draft] Unexpected error during generation");
  }

  if (!draft) {
    logger.warn({ ticketId: input.ticketId }, "[ai-draft] Engagera failed — no draft generated");
    return false;
  }

  const { error } = await admin.from("support_messages").insert({
    ticket_id: input.ticketId,
    sender_id: null,
    sender_type: "ai",
    message: draft,
    is_internal: false,
    metadata: {
      ai_draft: true,
      generated_at: new Date().toISOString(),
      provider: "engagera",
    },
  });

  if (error) {
    logger.error({ error, ticketId: input.ticketId }, "[ai-draft] Failed to insert draft");
    return false;
  }

  await admin
    .from("support_tickets")
    .update({ has_ai_draft: true })
    .eq("id", input.ticketId)
    .then(({ error: e }) => {
      if (e) {
        logger.info({ ticketId: input.ticketId }, "[ai-draft] has_ai_draft column not yet present (non-fatal)");
      }
    });

  logger.info({ ticketId: input.ticketId }, "[ai-draft] Draft inserted successfully");
  return true;
}
