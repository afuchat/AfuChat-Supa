/**
 * AfuChat AI chat edge function.
 *
 * Provider credentials stay in Supabase Edge Function secrets. The mobile
 * client sends only the conversation payload and never receives a provider key.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function streamChatWithEngagera(messages: unknown[], maxTokens: number, apiKey: string): Promise<Response> {
  const response = await fetch("https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-engagera-api-key": apiKey,
    },
    body: JSON.stringify({
      messages,
      model: "engagera-2.1",
      max_tokens: maxTokens,
       stream: true,
    }),
  });
  if (!response.ok) throw new Error(`Engagera error: ${response.status}`);
  return response;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { messages, max_tokens: requestedTokens, fast } = body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return json({ error: "messages array is required" }, 400);
  }

  const apiKey = Deno.env.get("ENGAGERA_API_KEY");
  if (!apiKey) {
    console.error("[afu-ai-reply] ENGAGERA_API_KEY is not configured");
    return json({ reply: "AI service is not configured. Please try again later." }, 503);
  }

  const maxTokens = typeof requestedTokens === "number" && requestedTokens > 0
    ? requestedTokens
    : fast ? 300 : 2048;

  try {
    const upstream = await streamChatWithEngagera(messages, maxTokens, apiKey);
    if (!upstream.body) throw new Error("Engagera returned no stream");
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("content-type") || "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[afu-ai-reply] Engagera chat failed", error);
    return json({ reply: "I'm having trouble connecting to AfuAI right now. Please try again in a moment." });
  }
});