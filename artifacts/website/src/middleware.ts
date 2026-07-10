import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, MOBILE_WEB_ORIGIN } from "./lib/env";
import { cookieOptionsFor } from "./lib/supabase/cookieOptions";

const MOBILE_UA_RE = /Android|iPhone|iPod|iPad|Mobile|Windows Phone/i;

const AUTH_REQUIRED_PATHS = ["/chats", "/profile"];

export async function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";
  const forceDesktop = request.nextUrl.searchParams.get("forceDesktop") === "1";
  if (!forceDesktop && MOBILE_UA_RE.test(userAgent)) {
    const target = new URL(MOBILE_WEB_ORIGIN);
    target.pathname = request.nextUrl.pathname;
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target);
  }

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
  const { pathname } = request.nextUrl;

  const requiresAuth = AUTH_REQUIRED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (!data.user && requiresAuth) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (data.user && pathname === "/login") {
    const next = request.nextUrl.searchParams.get("next");
    return NextResponse.redirect(new URL(next ?? "/feed", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
