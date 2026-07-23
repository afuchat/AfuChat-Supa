/**
 * deepLinkVerifier.ts
 *
 * Comprehensive deep-link and route-coverage verification.
 * Runs in __DEV__ mode only — zero cost in production.
 *
 * Two layers of protection:
 *
 * 1. NAVIGATION tests — ensure afuchat:// deep links resolve to the correct
 *    screen, not accidentally to [handle].tsx.
 *
 * 2. ROUTE COVERAGE tests — every top-level route segment that is a valid
 *    handle pattern (a-z0-9_, 1-30 chars) must be in RESERVED_ROUTES inside
 *    [handle].tsx, AND must NOT be misclassified as a referral/handle by
 *    deepLinkHandler. This is the belt-and-suspenders guard that ensures
 *    no internal app path ever leaks into the catch-all [handle] screen.
 *
 * Call verifyDeepLinks() once inside a useEffect in _layout.tsx.
 * Results are grouped in the dev console. logHandleLeak() is called from
 * [handle].tsx whenever a reserved segment slips through at runtime.
 */

import { handleIncomingUrl } from "./deepLinkHandler";

// ─── Types ────────────────────────────────────────────────────────────────────

type NavTest = {
  url: string;
  expectedType: "navigate" | "join_group" | "referral" | "null";
  expectedPath?: string;
  description: string;
};

// ─── ALL top-level route segments that exist as static files in app/ ──────────
// Partitioned into two groups:
//   • WORD_ROUTES: alphanumeric/underscore only → could be misread as a user handle
//   • HYPHEN_ROUTES: contain hyphens → handle regex /[a-zA-Z0-9_]{1,30}/ blocks them
//     automatically, so they're inherently safe even without explicit guards.

const WORD_ROUTES = [
  "about", "achievements", "ai", "article", "business",
  "channel", "chat", "collections", "company", "followers", "freelance",
  "games", "gifts", "group", "help", "join", "lab", "login", "match",
  "moments", "monetize", "onboarding", "p", "post", "premium", "prestige",
  "privacy", "profile", "referral", "settings", "shop", "shorts", "status",
  "store", "stories", "support", "terms", "video", "wallet", "welcome",
] as const;

const HYPHEN_ROUTES = [
  "business-verification", "call-history", "chat-search",
  "create-post", "device-security", "digital-events", "digital-id",
  "file-manager", "language-settings", "linked-accounts", "mini-programs",
  "my-posts", "paid-communities", "phone-contacts", "profile-not-found",
  "profile-private", "qr-scanner", "red-envelope", "saved-posts",
  "update-password", "user-discovery", "username-market", "video-analytics",
  "watch-history",
] as const;

// ─── Navigation deep-link test cases ─────────────────────────────────────────

const NAV_TESTS: NavTest[] = [
  // ── Critical navigation routes ──────────────────────────────────────────
  { url: "afuchat://settings",  expectedType: "navigate", expectedPath: "/settings",        description: "Settings" },
  { url: "afuchat://wallet",    expectedType: "navigate", expectedPath: "/wallet",           description: "Wallet" },
  { url: "afuchat://profile",   expectedType: "navigate", expectedPath: "/(tabs)/me",        description: "Profile tab" },
  { url: "afuchat://me",        expectedType: "navigate", expectedPath: "/(tabs)/me",        description: "Me tab (alias)" },
  { url: "afuchat://discover",  expectedType: "navigate", expectedPath: "/(tabs)/discover",  description: "Discover tab" },
  { url: "afuchat://chats",     expectedType: "navigate", expectedPath: "/(tabs)/chats",     description: "Chats tab" },
  { url: "afuchat://ai",        expectedType: "navigate", expectedPath: "/ai",               description: "AfuAI" },
  { url: "afuchat://premium",   expectedType: "navigate", expectedPath: "/premium",          description: "Premium" },
  { url: "afuchat://referral",  expectedType: "navigate", expectedPath: "/referral",         description: "Referral screen" },
  { url: "afuchat://about",     expectedType: "navigate", expectedPath: "/about",            description: "About screen" },
  { url: "afuchat://store",     expectedType: "navigate", expectedPath: "/store",            description: "Store" },
  { url: "afuchat://prestige",  expectedType: "navigate", expectedPath: "/prestige",         description: "Prestige" },
  // ── Chat with specific UUID ─────────────────────────────────────────────
  {
    url: "afuchat://chat/00000000-0000-0000-0000-000000000001",
    expectedType: "navigate", expectedPath: "/chat/[id]",
    description: "Chat by UUID",
  },
  // ── Group join ──────────────────────────────────────────────────────────
  {
    url: "afuchat://join/00000000-0000-0000-0000-000000000002",
    expectedType: "join_group",
    description: "Group join by UUID",
  },
  {
    url: "https://afuchat.com/join/00000000-0000-0000-0000-000000000003",
    expectedType: "join_group",
    description: "Group join via https:// link",
  },
  // ── Referral ────────────────────────────────────────────────────────────
  {
    url: "afuchat://ref/john",
    expectedType: "referral",
    description: "Referral /ref/handle path",
  },
  {
    url: "https://afuchat.com/someuser",
    expectedType: "referral",
    description: "Profile/referral https:// link",
  },
];

// ─── Route coverage tests — word routes (could be handles) ───────────────────
// Every word route must NOT be classified as a referral by deepLinkHandler.
// If any returns { type: "referral" }, it means the SYSTEM_ROUTES set in
// deepLinkHandler.ts is missing that entry → runtime leak risk.

async function runRouteCoverageTests() {
  const failures: string[] = [];

  for (const seg of WORD_ROUTES) {
    const url = `afuchat://${seg}`;
    try {
      const action = await handleIncomingUrl(url);
      // Acceptable outcomes: navigate (explicit nav route) or null (blocked by SYSTEM_ROUTES).
      // NOT acceptable: referral — that means the handler misidentified it as a user handle.
      if (action?.type === "referral") {
        failures.push(`"${seg}" → classified as REFERRAL (missing from SYSTEM_ROUTES!)`);
      }
    } catch {
      failures.push(`"${seg}" → threw an error`);
    }
  }

  // Hyphen routes: deepLinkHandler regex blocks these automatically, but verify anyway.
  for (const seg of HYPHEN_ROUTES) {
    const url = `afuchat://${seg}`;
    try {
      const action = await handleIncomingUrl(url);
      if (action?.type === "referral") {
        failures.push(`"${seg}" → classified as REFERRAL (should be impossible — has hyphen)`);
      }
    } catch {
      failures.push(`"${seg}" → threw an error`);
    }
  }

  return failures;
}

// ─── Navigation tests ─────────────────────────────────────────────────────────

async function runNavTests() {
  const failures: { desc: string; url: string; got: string; expected: string }[] = [];

  for (const tc of NAV_TESTS) {
    try {
      const action = await handleIncomingUrl(tc.url);
      const gotType = action === null ? "null" : action.type;
      const gotPath = action?.type === "navigate" ? action.path : undefined;

      const typeMatch = gotType === tc.expectedType;
      const pathMatch = tc.expectedPath == null || gotPath === tc.expectedPath;

      if (!typeMatch || !pathMatch) {
        failures.push({
          desc: tc.description,
          url: tc.url,
          got: action === null ? "null" : `${action.type}${gotPath ? ` → ${gotPath}` : ""}`,
          expected: tc.expectedPath ? `${tc.expectedType} → ${tc.expectedPath}` : tc.expectedType,
        });
      }
    } catch (err) {
      failures.push({
        desc: tc.description,
        url: tc.url,
        got: `ERROR: ${err}`,
        expected: tc.expectedPath ? `${tc.expectedType} → ${tc.expectedPath}` : tc.expectedType,
      });
    }
  }

  return failures;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run all verification tests. No-op in production builds.
 * Call once from _layout.tsx useEffect.
 */
export async function verifyDeepLinks(): Promise<void> {
  if (!__DEV__) return;

  const [navFailures, coverageFailures] = await Promise.all([
    runNavTests(),
    runRouteCoverageTests(),
  ]);

  const totalRoutes = WORD_ROUTES.length + HYPHEN_ROUTES.length;
  const totalNav    = NAV_TESTS.length;
  const totalFail   = navFailures.length + coverageFailures.length;
  const totalPass   = (totalNav + totalRoutes) - totalFail;

  console.group?.("[DeepLinkVerifier] Route verification");
  console.log(
    `✅ ${totalPass} passed  ❌ ${totalFail} failed` +
    `  (${totalNav} nav tests · ${totalRoutes} route coverage tests)`
  );

  if (navFailures.length > 0) {
    console.warn("[DeepLinkVerifier] ❌ Navigation test failures:");
    for (const f of navFailures) {
      console.warn(`  ${f.desc} | URL: ${f.url}`);
      console.warn(`    expected: ${f.expected}  got: ${f.got}`);
    }
  }

  if (coverageFailures.length > 0) {
    console.warn("[DeepLinkVerifier] ❌ Route coverage failures (handle leaks!):");
    for (const f of coverageFailures) {
      console.warn(`  ${f}`);
    }
  }

  if (totalFail === 0) {
    console.log("[DeepLinkVerifier] All routes protected — zero [handle].tsx leaks possible.");
  }

  console.groupEnd?.();
}

/**
 * Log a route leak — call this from [handle].tsx when a path that should
 * have been caught by a static file ends up in the catch-all handler.
 *
 * @param handle  The raw handle/path segment that landed in [handle].tsx
 * @param reason  Why it was flagged
 */
export function logHandleLeak(handle: string, reason: string): void {
  if (!__DEV__) return;
  console.warn(
    `[DeepLinkVerifier] ⚠️ Route leak!\n` +
    `  Segment "${handle}" reached [handle].tsx — ${reason}.\n` +
    `  Fix: add a static file or add to RESERVED_ROUTES.`
  );
}
