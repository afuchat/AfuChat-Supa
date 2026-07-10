/**
 * env.ts — single source of truth for public runtime constants on the
 * desktop web client. Mirrors artifacts/mobile/lib/env.ts so both clients
 * point at the exact same Supabase project.
 */

export const SUPABASE_URL: string =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim() ||
  "https://rhnsjqqtdzlkvqazfcbg.supabase.co";

export const SUPABASE_ANON_KEY: string =
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim() ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY";

// Where the mobile-optimized web client (Expo web) lives. Mobile/narrow
// viewports opening the desktop site get bounced here.
export const MOBILE_WEB_ORIGIN: string =
  (process.env.NEXT_PUBLIC_MOBILE_WEB_ORIGIN ?? "").trim() ||
  "https://web.afuchat.com";
