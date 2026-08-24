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
 * XMLHttpRequest exposes incremental responseText on Android where the
 * regular fetch response body can be unavailable in Expo Go.
 */
export async function* streamAiChat(
  params: Pick<ChatCreateParams, "messages" | "model"> &
    Partial<Pick<ChatCreateParams, "conversationId" | "contextHint">> & {
      fast?: boolean;
      maxTokens?: number;
    }
): AsyncGenerator<ChatStreamEvent> {
  type QueueItem = ChatStreamEvent | { end: true; error?: Error };
  const queue: QueueItem[] = [];
  let wake: (() => void) | null = null;
  let settled = false;
  const push = (item: QueueItem) => {
    queue.push(item);
    wake?.();
    wake = null;
  };
  const xhr = new XMLHttpRequest();
  let cursor = 0;
  let pending = "";
  let accumulated = "";
  let sawSse = false;

  const contentFrom = (value: any): string => String(
    value?.choices?.[0]?.delta?.content ??
    value?.choices?.[0]?.message?.content ??
    value?.message?.content ??
    value?.content ??
    value?.reply ??
    ""
  );
  const emitSse = (raw: string) => {
    const data = raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
    if (!data || data === "[DONE]") return;
    sawSse = true;
    try {
      const text = contentFrom(JSON.parse(data));
      if (text) {
        accumulated += text;
        push({ type: "text", text });
      }
    } catch {
      // Ignore incomplete or non-JSON SSE comments.
    }
  };
  const consume = (chunk: string, final = false) => {
    pending += chunk;
    const frames = pending.split(/\r?\n\r?\n/);
    pending = final ? "" : (frames.pop() ?? "");
    frames.forEach((frame) => emitSse(frame));
    if (final && !sawSse && pending) {
      try {
        const text = contentFrom(JSON.parse(pending));
        if (text) {
          accumulated = text;
          push({ type: "text", text });
        }
      } catch {}
    }
  };

  xhr.open("POST", `${BASE_URL}/afu-ai-reply`);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_ANON_KEY}`);
  xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
  xhr.onprogress = () => {
    const next = xhr.responseText.slice(cursor);
    cursor = xhr.responseText.length;
    if (next) consume(next);
  };
  xhr.onload = () => {
    const next = xhr.responseText.slice(cursor);
    if (next) consume(next, true);
    if (xhr.status < 200 || xhr.status >= 300) {
      push({ end: true, error: new Error(`AI request failed (${xhr.status})`) });
      return;
    }
    if (!accumulated.trim()) {
      push({ end: true, error: new Error("AI returned an empty response") });
      return;
    }
    push({
      type: "done",
      content: accumulated,
      model: params.model ?? "afu-ai",
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    });
    push({ end: true });
  };
  xhr.onerror = () => push({ end: true, error: new Error("AI network request failed") });
  xhr.onabort = () => push({ end: true, error: new Error("AI request cancelled") });
  xhr.send(JSON.stringify({
    messages: params.messages,
    fast: params.fast ?? true,
    max_tokens: params.maxTokens ?? 500,
  }));

  while (!settled) {
    if (queue.length === 0) await new Promise<void>((resolve) => { wake = resolve; });
    while (queue.length > 0) {
      const item = queue.shift()!;
      if ("end" in item) {
        settled = true;
        if (item.error) throw item.error;
        break;
      }
      yield item;
    }
  }
}
