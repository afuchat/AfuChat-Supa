import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../env";
import { cookieOptionsFor } from "./cookieOptions";

/** Server-side Supabase client for use in Server Components / Route Handlers. */
export async function createClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const hostname = headerStore.get("host")?.split(":")[0] ?? "";
  const options = cookieOptionsFor(hostname);

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options: perCookieOptions } of cookiesToSet) {
            cookieStore.set(name, value, { ...options, ...perCookieOptions });
          }
        } catch {
          // Called from a Server Component — middleware refreshes the
          // session instead, so this is safe to ignore.
        }
      },
    },
  });
}
