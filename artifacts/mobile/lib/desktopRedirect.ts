/**
 * desktopRedirect.ts — companion to artifacts/website's mobile-redirect
 * middleware. This Expo web build is optimized for phones/small tablets;
 * desktop-sized browsers get bounced to the dedicated desktop client at
 * desktop.afuchat.com instead of the squeezed mobile layout.
 *
 * Checked once on load only (not on resize), so someone resizing an open
 * desktop browser window isn't yanked away mid-session. Skippable with
 * ?forceMobile=1 for testing.
 */
import { Platform } from "react-native";

const DESKTOP_ORIGIN = "https://desktop.afuchat.com";
const MOBILE_UA_RE = /Android|iPhone|iPod|iPad|Mobile|Windows Phone/i;

export function redirectIfDesktop(): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;

  const params = new URLSearchParams(window.location.search);
  if (params.get("forceMobile") === "1") return;

  // Never redirect when running on localhost or in a Replit dev/preview environment.
  const hostname = window.location.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".replit.dev") || hostname.endsWith(".repl.co")) return;

  const isMobileUA = MOBILE_UA_RE.test(window.navigator.userAgent);
  const isNarrow = window.innerWidth < 900;
  if (isMobileUA || isNarrow) return;

  const target = new URL(DESKTOP_ORIGIN);
  target.pathname = window.location.pathname;
  target.search = window.location.search;
  target.hash = window.location.hash;
  window.location.replace(target.toString());
}
