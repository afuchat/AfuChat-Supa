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
import { ENGAGERA_API_KEY } from "@/lib/env";

const BASE_URL = "https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1";

/**
 * Streams an Engagera chat response token-by-token using XMLHttpRequest.
 * Drop-in replacement for `engagera.chat.stream()` that works on Android.
 */
export async function* streamAiChat(
  params: Pick<ChatCreateParams, "messages" | "model"> &
    Partial<Pick<ChatCreateParams, "conversationId" | "contextHint">>
): AsyncGenerator<ChatStreamEvent> {
  if (!ENGAGERA_API_KEY) throw new Error("ENGAGERA_API_KEY is not configured");

  type Slot =
    | { kind: "event"; event: ChatStreamEvent }
    | { kind: "done" }
    | { kind: "error"; err: Error };

  const queue: Slot[] = [];
  let notify: (() => void) | null = null;

  const push = (slot: Slot) => {
    queue.push(slot);
    notify?.();
    notify = null;
  };

  // Parse SSE blocks accumulated in `buf` and push typed events into the queue.
  let buf = "";
  const flush = (chunk: string) => {
    buf += chunk;
    const blocks = buf.split(/\n\n/);
    buf = blocks.pop() ?? "";
    for (const block of blocks) {
      if (!block.trim()) continue;
      let dataLine = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }
      if (!dataLine || dataLine === "[DONE]") continue;
      let parsed: Record<string, any>;
      try { parsed = JSON.parse(dataLine); } catch { continue; }

      const type: string = parsed.type ?? "text";
      if (type === "token" || type === "text") {
        const text: string = parsed.text ?? parsed.content ?? "";
        if (text) push({ kind: "event", event: { type: "text", text } });
      } else if (type === "done") {
        push({
          kind: "event",
          event: {
            type: "done",
            content: parsed.content ?? "",
            model: parsed.model ?? (params.model ?? "engagera-2.1"),
            conversationId: parsed.conversationId,
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          },
        });
      } else if (type === "error") {
        push({ kind: "error", err: new Error(parsed.error ?? "Stream error") });
      }
    }
  };

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `${BASE_URL}/chat`, /* async */ true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.setRequestHeader("x-engagera-api-key", ENGAGERA_API_KEY);
  xhr.timeout = 120_000;

  let processed = 0;

  xhr.onprogress = () => {
    const newText = (xhr.responseText ?? "").slice(processed);
    processed = (xhr.responseText ?? "").length;
    if (newText) flush(newText);
  };

  xhr.onload = () => {
    const remaining = (xhr.responseText ?? "").slice(processed);
    if (remaining) flush(remaining);
    push({ kind: "done" });
  };

  xhr.onerror = () =>
    push({ kind: "error", err: new Error(`Network error (XHR status ${xhr.status})`) });

  xhr.ontimeout = () =>
    push({ kind: "error", err: new Error("AI request timed out after 120s") });

  xhr.send(
    JSON.stringify({
      messages: params.messages,
      model: params.model ?? "engagera-2.1",
      conversationId: params.conversationId,
      contextHint: params.contextHint,
      stream: true,
    })
  );

  // Yield events as they arrive, driven by the promise queue.
  while (true) {
    if (queue.length === 0) {
      await new Promise<void>((r) => { notify = r; });
    }
    while (queue.length > 0) {
      const slot = queue.shift()!;
      if (slot.kind === "done") return;
      if (slot.kind === "error") throw slot.err;
      yield slot.event;
    }
  }
}
