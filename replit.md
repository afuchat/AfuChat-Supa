# AfuChat — Project Overview

## Replit setup status (verified 2026-07-14)
- **Dependencies**: installed via `pnpm install` at workspace root (all packages resolved, postinstall patches applied)
- **Mobile app** (port 5000): running — Expo web bundled, React app initialises, all 82 route tests pass
- **API server** (port 3000): running — `app_settings` loaded from Supabase (9 keys), video encoder active
- **Desktop website** (port 5173): running — Next.js serving live AfuChat feed with real Supabase data
- **`ACCOUNT_PURGE_SECRET`**: added to `.replit` env vars (admin endpoint protection)
- **Supabase credentials** fetched via Management API using `SUPABASE_ACCESS_TOKEN`; public values hardcoded in source as fallbacks, service role key in `.replit` env vars

## What this is
AfuChat is a social mobile app (React Native/Expo) with an Express API backend. The app includes messaging, posts, stories, video, payments (Pesapal), AI chat, and more.

## Architecture
- **`artifacts/mobile`** — Expo/React Native mobile app (runs on port 5000 in dev, scannable with Expo Go)
- **`artifacts/api-server`** — Express API server (runs on port 3000)
- **`lib/db`** — Drizzle ORM schema (optional; no tables defined — all data lives in Supabase)
- **`lib/api-spec`, `lib/api-zod`, `lib/api-client-react`** — shared types and API client
- **`supabase/`** — Supabase Edge Functions + migrations (auth, realtime, AI)

## How to run
- **Start Backend** workflow: starts the Express API server on port 3000
- **Start application** workflow: starts Expo Metro bundler on port 5000 (scan QR in Expo Go or open web)
- Both workflows run together via the **Project** workflow

## Key services used
- **Supabase** — auth, realtime subscriptions, storage (videos), edge functions (AI chat), database
- **Cloudflare R2** — media storage (avatars, posts, stories, chat media)
- **Pesapal** — payments gateway (Africa-focused)
- **Resend** — transactional email

## AI Architecture

> **All AI features run exclusively through Supabase Edge Functions.**
> Never move AI logic into the Express server or call AI APIs from the mobile app directly.

### How it works
The mobile client (`artifacts/mobile/lib/aiHelper.ts`) calls Supabase Edge Functions directly:

| Feature | Edge Function | File |
|---|---|---|
| In-app AI chat & suggestions | `afu-ai-reply` | `supabase/functions/afu-ai-reply/index.ts` |
| AI chat (legacy alias) | `ai-chat` | `supabase/functions/ai-chat/index.ts` |
| Voice message transcription | `transcribe-audio` | `supabase/functions/transcribe-audio/index.ts` |
| AI image generation (premium) | `generate-ai-image` | `supabase/functions/generate-ai-image/index.ts` |

All requests go to: `https://<project>.supabase.co/functions/v1/<function-name>`

### Why Supabase Edge Functions — not the Express server
- **Auth enforcement**: Edge functions verify the Supabase JWT and can check premium subscriptions before touching any AI API.
- **Secret isolation**: AI API keys (`GROQ_API_KEY`, `OPENAI_API_KEY`, etc.) live only in Supabase Edge Function secrets — they are never in the Express server or Replit env vars.
- **Cost control**: The edge function layer is where rate limiting, quota checks, and XP rewards happen.
- **Scalability**: Edge functions run globally close to users; the Express server handles upload signing and admin tasks only.

### Where to set AI API keys
Go to **Supabase Dashboard → Project → Edge Functions → Secrets** and set:
- `GROQ_API_KEY` — used by `afu-ai-reply` and `ai-chat` for LLM chat and transcription
- `OPENAI_API_KEY` — used by `transcribe-audio` (Whisper) and `generate-ai-image` (DALL-E)
- `RUNWARE_API_KEY`, `AIMLAPI_KEY`, `FREEPIK_API_KEY` — optional image generation providers

**Do NOT add these keys to Replit secrets or `.env` files.** They are only needed in Supabase.

### How to update AI models or providers
Edit the relevant file in `supabase/functions/` and redeploy with the Supabase CLI:
```
supabase functions deploy afu-ai-reply
```
The `ai-chat` route file in the Express server (`artifacts/api-server/src/routes/ai-chat.ts`) is intentionally empty — do not add AI logic there.

## Platform independence
The app does NOT depend on any Replit-specific service to operate:
- All data is stored in **Supabase** (not Replit PostgreSQL — the Drizzle schema is intentionally empty)
- All media is stored in **Cloudflare R2** (not Replit Object Storage)
- Auth is handled by **Supabase Auth** (not Replit Auth)
- Runtime config (R2 keys, Pesapal keys, etc.) is loaded from the **Supabase `app_settings` table** on startup
- The build script accepts `APP_DOMAIN` as a host-agnostic alternative to `REPLIT_DEV_DOMAIN`

## Backend URL for mobile builds
When building the mobile app with EAS (preview/production), set `EXPO_PUBLIC_API_URL` in
`artifacts/mobile/eas.json` to your deployed backend domain, e.g. `https://api.afuchat.com`.
The placeholder `https://YOUR_BACKEND_DOMAIN` must be replaced before shipping.

## Required secrets

### Replit secrets (only ONE key lives here)
- `SUPABASE_SERVICE_ROLE_KEY` — the only Replit secret; enables bootstrap to load everything else from Supabase
- `SUPABASE_ACCESS_TOKEN` — Supabase CLI token used for migrations and edge function deploys from Replit

### Supabase `app_settings` table (all other secrets)
All runtime secrets live in `public.app_settings` and are injected into `process.env` by `bootstrap.ts` at startup.
To add/update a secret: `INSERT INTO app_settings (key, value) VALUES ('MY_KEY', 'value') ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`

Keys currently in app_settings (✓ = confirmed present):
- ✓ `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY` — R2 media
- ✓ `R2_BUCKET`, `R2_PUBLIC_BASE_URL`, `R2_S3_ENDPOINT`, `R2_DEV_PUBLIC_URL` — R2 config
- ✓ `AFUMAIL_API_BASE`, `AFUMAIL_CLIENT_ID`, `AFUMAIL_CLIENT_SECRET` — transactional email
- ✓ `PESAPAL_ENV` — payment environment (`sandbox` or `live`)
- ✓ `OAUTH_SESSION_SECRET` — cookie signing for OAuth consent flow (auto-generated)
- ✓ `ACCOUNT_PURGE_SECRET` — admin key for account purge endpoint (auto-generated)
- ✓ `PUSH_WEBHOOK_TOKEN` — push notification webhook auth (auto-generated)
- ✗ `RESEND_API_KEY` — **MISSING** — transactional email (causes `hasResend: false`)
- ✗ `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, `PESAPAL_IPN_ID` — **MISSING** — payments
- ✗ `GROQ_API_KEY` — **MISSING** — AI auto-responder (causes `hasAi: false`)
- ✗ `GOOGLE_AI_KEY` — optional Gemini fallback for AI auto-responder

### Supabase Edge Function secrets (set in Supabase Dashboard → Edge Functions → Secrets)
- `GROQ_API_KEY` — LLM chat (`afu-ai-reply`, `ai-chat`, `transcribe-audio`)
- `OPENAI_API_KEY` — Whisper transcription + DALL-E image generation
- `RUNWARE_API_KEY`, `AIMLAPI_KEY`, `FREEPIK_API_KEY` — optional image providers

## Deployment domains
- This mobile app's web export is served at **web.afuchat.com** (not afuchat.com — that's the separate marketing site in `artifacts/afuchat-website`).
- Shared Supabase auth cookie logic (`.afuchat.com` domain) treats both `afuchat.com` and `web.afuchat.com` as "real" hosts — see `isProdHost()` in `artifacts/mobile/lib/supabase.ts`.

## User preferences
- Use pnpm for package management (enforced by preinstall hook)
- API server must be built before starting (`pnpm run build` in `artifacts/api-server`)
- The mobile app uses Expo Router (file-based routing under `artifacts/mobile/app/`)
- Never expose Supabase service role key to the client/mobile app
- AI must always remain on Supabase Edge Functions — do not move it to the Express server
