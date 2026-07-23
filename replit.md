# AfuChat — Project Overview

## Replit setup status (verified 2026-07-23)
- **Dependencies**: installed via `pnpm install` at workspace root (Node.js 22)
- **Mobile app** (port 5001): running — Expo Metro bundler, scannable with Expo Go or open in browser

## What this is
AfuChat is a social mobile app (React Native/Expo). The app includes messaging, posts, stories, video, payments (Pesapal), AI chat, and more.

## Architecture
- **`artifacts/mobile`** — Expo/React Native mobile app (only artifact; website artifact removed)

## How to run
- **Start application** workflow: starts Expo Metro bundler on port 5001 (scan QR in Expo Go or open web)

## Key services used
- **Supabase** — auth, realtime subscriptions, storage (videos), edge functions (AI chat), database
- **Cloudflare R2** — media storage (avatars, posts, stories, chat media)
- **Pesapal** — payments gateway (Africa-focused)

## Required secrets
- `SUPABASE_SERVICE_ROLE_KEY` — enables the API server to load config from Supabase `app_settings`
- `SUPABASE_ACCESS_TOKEN` — Supabase CLI token for migrations and edge function deploys

## User preferences
- Use pnpm for package management
- The mobile app uses Expo Router (file-based routing under `artifacts/mobile/app/`)
- Never expose Supabase service role key to the client/mobile app
- AI must always remain on Supabase Edge Functions
