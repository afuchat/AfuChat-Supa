import { NextResponse, type NextRequest } from "next/server";
import { MOBILE_WEB_ORIGIN } from "./lib/env";

const MOBILE_UA_RE = /Android|iPhone|iPod|iPad|Mobile|Windows Phone/i;

export function middleware(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") ?? "";
  const forceDesktop = request.nextUrl.searchParams.get("forceDesktop") === "1";
  if (!forceDesktop && MOBILE_UA_RE.test(userAgent)) {
    const target = new URL(MOBILE_WEB_ORIGIN);
    target.pathname = request.nextUrl.pathname;
    target.search = request.nextUrl.search;
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
