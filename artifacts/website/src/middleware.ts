import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, MOBILE_WEB_ORIGIN } from "./lib/env";
import { cookieOptionsFor } from "./lib/supabase/cookieOptions";

const MOBILE_UA_RE = /Android|iPhone|iPod|iPad|Mobile|Windows Phone/i;
const PUBLIC_PATHS = ["/login"];

export async function middleware(request: NextRequest) {
  // ── 1. Bounce phones/small tablets to the Expo web build ─────────────────
  // This desktop client is built for wide screens; narrow devices get a
  // better experience on the existing mobile web app. Checked via UA only
  // (no viewport info is available server-side) and skippable with
  // ?forceDesktop=1 for testing.
  const userAgent = request.headers.get("user-agent") ?? "";
  const forceDesktop = request.nextUrl.searchParams.get("forceDesktop") === "1";
  if (!forceDesktop && MOBILE_UA_RE.test(userAgent)) {
    const target = new URL(MOBILE_WEB_ORIGIN);
    target.pathname = request.nextUrl.pathname;
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target);
  }

  // ── 2. Refresh the shared Supabase session cookie ─────────────────────────
  let response = NextResponse.next({ request });
  const hostname = request.nextUrl.hostname;
  const options = cookieOptionsFor(hostname);

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options: perCookieOptions } of cookiesToSet) {
          response.cookies.set(name, value, { ...options, ...perCookieOptions });
        }
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const isPublicPath = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));

  if (!data.user && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
  if (data.user && request.nextUrl.pathname === "/login") {
    return NextResponse.redirect(new URL("/chats", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
