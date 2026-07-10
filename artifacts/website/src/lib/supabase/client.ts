"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../env";
import { cookieOptionsFor } from "./cookieOptions";

export function createClient() {
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: cookieOptionsFor(hostname),
  });
}
