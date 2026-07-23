# AfuChat

A full-featured social mobile app built with React Native / Expo (SDK 55, New Architecture), a Node/Express API server, and Supabase as the backend.

## Stack

- **Mobile app**: React Native 0.83 + Expo SDK 55 (New Architecture / Hermes), Expo Router v3, TypeScript
- **State**: TanStack Query, Zustand, MMKV v4 (Nitro), Drizzle ORM + SQLite (native offline cache)
- **Backend API**: Express server in `artifacts/mobile/server/` (port 3000)
- **Database / Auth**: Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
- **Media**: Cloudflare R2 for video/image storage
- **Package manager**: pnpm (workspace monorepo rooted at repo root)

## How to run

The **Start application** workflow handles everything:

```
cd artifacts/mobile && EXPO_OFFLINE=1 EXPO_NO_LAZY=1 PORT=5000 \
  EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN EXPO_PUBLIC_REPL_ID=$REPL_ID \
  EXPO_PACKAGER_PROXY_URL=https://$REPLIT_EXPO_DEV_DOMAIN \
  REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_EXPO_DEV_DOMAIN \
  ./node_modules/.bin/expo start --web --port 5000
```

- **Web preview**: available in the Replit preview pane (port 5000)
- **Expo Go (native)**: scan the QR code shown in the workflow console — uses the `exp+afuchat://` deep link

### Install dependencies (first time or after pulling changes)

```bash
cd artifacts/mobile && pnpm install
```

## Key environment variables (already set in Replit)

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `EXPO_TOKEN` | Expo account token for EAS builds |
| `CLOUDFLARE_ACCOUNT_ID` / `R2_BUCKET` | Cloudflare R2 media storage |

## Project layout

```
artifacts/mobile/
  app/              # Expo Router screens (file-based routing)
  components/       # Shared UI components
  context/          # React context providers (Auth, Theme, …)
  lib/              # Utilities, Supabase client, services
  server/           # Express API server (port 3000)
  supabase/         # Migrations and Edge Function source
  scripts/          # postinstall.sh, EAS build helpers
  metro.config.js   # Metro bundler config (API proxy, web shims)
  app.json          # Expo config
```

## Important notes

- `EXPO_OFFLINE=1` skips Expo auth/login prompt on startup (required on Replit)
- `EXPO_NO_LAZY=1` disables multipart bundle streaming (prevents proxy errors with Expo Go)
- The Metro config proxies `/api/*` requests to the Express server on port 3000
- Web builds use shims for `react-native-reanimated`, `react-native-pager-view`, and `expo-sqlite`
- EAS builds require `EAS_NO_VCS=1` (Replit blocks `git stash`)

## User preferences

_None recorded yet._
