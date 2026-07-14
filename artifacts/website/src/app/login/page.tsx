/**
 * /login — no longer a standalone auth page.
 * Redirect visitors to the feed and open the auth sheet there so they never
 * land on a blank login screen; public content is always visible first.
 */
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string; next?: string }>;
}) {
  const params = await searchParams;
  const mode   = params.mode === "signup" ? "signup" : "signin";
  const next   = params.next ? `&next=${encodeURIComponent(params.next)}` : "";
  redirect(`/feed?auth=${mode}${next}`);
}
