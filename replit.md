# AfuChat Android app

AfuChat is an Android-first React Native application built with Expo SDK 55, Expo Router, Hermes, and the React Native New Architecture. The app connects directly to the existing Supabase project for authentication, database access, realtime data, storage, and Edge Functions.

## Run the app

Install dependencies from the repository root:

```bash
pnpm install
```

The **Start application** workflow runs the Android Expo bundler:

```bash
cd artifacts/mobile
EXPO_OFFLINE=1 EXPO_NO_LAZY=1 \
  EXPO_PUBLIC_DOMAIN=$REPLIT_DEV_DOMAIN \
  EXPO_PUBLIC_REPL_ID=$REPL_ID \
  EXPO_PACKAGER_PROXY_URL=https://$REPLIT_EXPO_DEV_DOMAIN \
  REACT_NATIVE_PACKAGER_HOSTNAME=$REPLIT_EXPO_DEV_DOMAIN \
  pnpm exec expo start --port 8000
```

Use the Expo Go QR code from the workflow output to open the app on an Android device.

## Project layout

```text
artifacts/mobile/
  app/          # Expo Router screens
  components/   # Shared React Native UI
  context/      # Auth, theme, language, and app state
  hooks/        # Reusable hooks
  lib/          # Native storage, Supabase, media, and app services
  modules/      # Native mini-app modules
  supabase/     # Existing migrations and Edge Function source
  scripts/      # Native build and post-install helpers
```

The `artifacts/mobile/supabase/` directory is part of the existing Supabase setup and must remain unchanged when making app-only cleanup work.

## Important conventions

- Keep the app native Android; do not add web routes, web layouts, or a server layer.
- Use the native Supabase client with AsyncStorage.
- Keep `expo-web-browser` for OAuth and links that intentionally open outside the app.
- Keep `react-native-webview` for the native AfuPay payment flow.
- Use `EXPO_OFFLINE=1` in Replit; `CI=1` prevents the Expo native bundle from serving correctly.
- EAS builds from Replit require `EAS_NO_VCS=1`.

## Environment

The Replit environment already provides the public Supabase URL and anonymous key used by the app. Do not commit credentials or change the existing Supabase migrations and functions.

## Checks

```bash
cd artifacts/mobile
pnpm exec expo export --platform android
pnpm run typecheck
```