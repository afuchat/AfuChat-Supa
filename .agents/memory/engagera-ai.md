---
name: Engagera AI integration
description: All AfuChat AI now routes through Engagera (engagera.afuchat.com). Critical: response shape differs from OpenAI.
---

## Engagera API

- **Endpoint**: `POST https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/chat`
- **Auth**: `Authorization: Bearer eng_...`
- **Request**: `{ model: "auto", messages: [...], max_tokens?: number }`
- **Response**: `{ id, model, message: { role, content }, usage, searchInfo }`

**Why:** Response is `data.message.content` NOT `data.choices[0].message.content` (OpenAI format). This is the most common mistake when integrating.

## Where the key lives

- **Supabase Edge Function secrets**: `ENGAGERA_API_KEY` — used by `chat-with-afuai` and `afu-ai-reply`
- **Supabase `app_settings` table**: key `ENGAGERA_API_KEY` — bootstrapped into Express server `process.env` at startup, used by `aiAutoResponder.ts`

## What was replaced

| Old | New |
|-----|-----|
| `chat-with-afuai`: `LOVABLE_API_KEY` → `ai.gateway.lovable.dev/v1/chat/completions` | `ENGAGERA_API_KEY` → Engagera endpoint |
| `afu-ai-reply`: did not exist in repo (deployed separately with GROQ) | New function created in `supabase/functions/afu-ai-reply/index.ts` using Engagera |
| `aiAutoResponder.ts`: Groq + Gemini fallback chain | Single Engagera call |

## Models

Use `"auto"` for Engagera's auto-routing. The `allowedModels` list in `chat-with-afuai` includes `auto`, `google/gemini-2.5-flash`, `google/gemini-2.5-pro`, `openai/gpt-4o-mini`, `openai/gpt-4o`, `meta/llama-3.3-70b`.

## Deployment

```bash
SUPABASE_ACCESS_TOKEN=<sbp_token> pnpm --package=supabase dlx supabase secrets set ENGAGERA_API_KEY=eng_... --project-ref rhnsjqqtdzlkvqazfcbg
SUPABASE_ACCESS_TOKEN=<sbp_token> pnpm --package=supabase dlx supabase functions deploy chat-with-afuai --project-ref rhnsjqqtdzlkvqazfcbg --use-api
SUPABASE_ACCESS_TOKEN=<sbp_token> pnpm --package=supabase dlx supabase functions deploy afu-ai-reply --project-ref rhnsjqqtdzlkvqazfcbg --use-api
```
