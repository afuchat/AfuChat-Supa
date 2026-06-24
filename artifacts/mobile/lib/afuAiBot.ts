import { supabase } from "@/lib/supabase";
import { askAi } from "@/lib/aiHelper";
import { buildNavigationContext, ACTION_ROUTES_GUIDE } from "@/lib/platformKnowledge";

export const AFUAI_BOT_ID = "c7ec234e-1ae8-499c-8318-6a592c5f81bb";

export async function ensureAfuAiChat(userId: string, displayName?: string): Promise<void> {
  try {
    const { data: chatId, error } = await supabase.rpc("get_or_create_direct_chat", {
      other_user_id: AFUAI_BOT_ID,
    });

    if (error || !chatId) return;

    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("chat_id", chatId);

    if ((count ?? 0) > 0) return;

    const name = displayName || "there";
    let greeting: string;
    try {
      greeting = await askAi(
        `Write a short, warm welcome to a new AfuChat user named "${name}". 2-3 sentences max. Be friendly and real — no lists, no markdown.`,
        "You are AfuAI, AfuChat's built-in AI assistant. Write only the welcome message.",
        { fast: true, maxTokens: 120 }
      );
    } catch {
      greeting = `Hey ${name}! 👋 I'm AfuAI — ask me anything, anytime. Welcome to AfuChat!`;
    }

    await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: AFUAI_BOT_ID,
      encrypted_content: greeting,
    });
  } catch (_) {}
}

export async function getAfuAiReply(
  userText: string,
  recentMessages: { sender: string; content: string }[],
  userName?: string
): Promise<string> {
  const history = recentMessages
    .map((m) => `${m.sender}: ${m.content}`)
    .join("\n");

  const contextBlock = history ? `Conversation so far:\n${history}\n\n` : "";
  const name = userName ? `The user's name is ${userName}. ` : "";
  const platformContext = buildNavigationContext();

  return askAi(
    `${contextBlock}User: ${userText}`,
    `You are AfuAI, a friendly AI assistant inside AfuChat — a social super app from Uganda. ${name}

RESPONSE STYLE — follow these rules strictly:
- Be human. Talk like a real person in a chat, not an essay or report.
- Keep it SHORT. 1–4 sentences for most replies. Only go longer if the user explicitly asks for detail.
- Never start with filler ("Of course!", "Great question!", "Certainly!", "Sure!"). Get straight to the point.
- Use rich text where it genuinely helps: **bold** for key terms, bullet points (•) for lists when needed, emojis sparingly. Never expose raw markdown syntax to the user — always render it.
- Match the user's energy: if they're casual, be casual. If they need a quick fact, give one line.
- Respond in the same language the user writes in.
- Never say you're built by another company — you are AfuAI.

PLATFORM KNOWLEDGE — use when the user asks about the app:
${platformContext}

${ACTION_ROUTES_GUIDE}

SEARCH: [ACTION:Search for X:/search?q=X] (spaces → +)
PROFILE: [ACTION:View @handle:/@handle]

When a user asks to navigate or find something, give short guidance + an [ACTION:...] tap button.`,
    { fast: false, maxTokens: 300 }
  );
}
