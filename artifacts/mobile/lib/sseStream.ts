/**
 * sseStream.ts — React Native / Hermes compatible SSE streaming for Engagera.
 *
 * The Engagera SDK's built-in stream() uses response.body.getReader()
 * (WHATWG ReadableStream). On Android/Hermes, fetch() returns response.body
 * as null, so that path always throws. This implementation uses XMLHttpRequest
 * whose onprogress callback fires with real chunks on every platform — Android,
 * iOS, and web — giving true token-by-token streaming everywhere.
 */

import type { ChatCreateParams, ChatStreamEvent } from "@afuchat1/engagera";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/env";

const BASE_URL = `${SUPABASE_URL}/functions/v1`;

/**
 * Streams an Engagera chat response token-by-token using XMLHttpRequest.
 * Drop-in replacement for `engagera.chat.stream()` that works on Android.
 */
export async function* streamAiChat(
  params: Pick<ChatCreateParams, "messages" | "model"> &
    Partial<Pick<ChatCreateParams, "conversationId" | "contextHint">>
): AsyncGenerator<ChatStreamEvent> {
  const response = await fetch(`${BASE_URL}/afu-ai-reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      messages: params.messages,
      fast: false,
      max_tokens: 800,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI request failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ""}`);
  }
  const data = await response.json();
  const content = String(data.reply ?? data.content ?? "").trim();
  if (!content) throw new Error("AI returned an empty response");
  yield { type: "text", text: content };
  yield {
    type: "done",
    content,
    model: params.model ?? "afu-ai",
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}
