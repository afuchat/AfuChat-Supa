// ─── AfuChat Brand Identity ───────────────────────────────────────────────────
// ONE source of truth for all color decisions.
// Import `Colors` (default) for raw palette values.
// Import `useTheme()` for the live, resolved theme object inside components.

const BRAND        = "#1f95ff";   // primary brand — all interactive elements
const BRAND_DARK   = "#1a7fd4";   // pressed / darker variant of brand
const BRAND_BLUE   = "#1677FF";   // alternate blue (legacy alias)
const GOLD         = "#D4A853";   // prestige / premium / ACoin

// ─── Semantic status palette (theme-independent) ──────────────────────────────
// These never change between light/dark — they carry universal meaning.
export const STATUS = {
  success:        "#34C759",   // green  — completed, confirmed, healthy
  successSubtle:  "#34C75920",
  warning:        "#FF9F0A",   // amber  — caution, pending, degraded
  warningSubtle:  "#FF9F0A20",
  error:          "#FF3B30",   // red    — failure, danger, destructive
  errorSubtle:    "#FF3B3020",
  info:           "#5AC8FA",   // sky    — informational, neutral notice
  infoSubtle:     "#5AC8FA20",
} as const;

// ─── Theme palettes ───────────────────────────────────────────────────────────
// Semantic names only — no raw hex strings in component code.

const light = {
  // ── Typography ──────────────────────────────────────────────────────────────
  text:              "#000000",
  textSecondary:     "#5A5040",
  textMuted:         "#8C7F6A",

  // ── Backgrounds ─────────────────────────────────────────────────────────────
  background:        "#F5F0E8",   // page / screen
  backgroundSecondary: "#EDE8DC", // cards, sheets
  backgroundTertiary:  "#E8E2D6", // inset areas, code blocks
  surface:           "#F5F0E8",   // elevated surfaces
  card:              "#EDE8DC",

  // ── Lines ───────────────────────────────────────────────────────────────────
  border:            "#DDD7C9",
  separator:         "#DDD7C9",

  // ── Interactive ─────────────────────────────────────────────────────────────
  accent:            BRAND,
  tint:              BRAND,
  tabIconDefault:    "#8C7F6A",
  tabIconSelected:   BRAND,

  // ── Icons ───────────────────────────────────────────────────────────────────
  icon:              "#4A4035",
  iconMuted:         "#8C7F6A",

  // ── Chat bubbles ────────────────────────────────────────────────────────────
  bubble:            BRAND,
  bubbleText:        "#FFFFFF",
  bubbleIncoming:    "#EDE8DC",
  bubbleIncomingText:"#1A1208",

  // ── Form inputs ─────────────────────────────────────────────────────────────
  inputBg:           "#EDE8DC",

  // ── Glass surface tokens (light equivalents — subtle shadows) ────────────────
  glassBg:           "rgba(0,0,0,0.05)",
  glassBgSubtle:     "rgba(0,0,0,0.03)",

  // ── Navigation ──────────────────────────────────────────────────────────────
  header:            "#F5F0E8",

  // ── Badges ──────────────────────────────────────────────────────────────────
  badgeBg:           STATUS.error,
  badgeText:         "#FFFFFF",

  // ── Presence ────────────────────────────────────────────────────────────────
  online:            BRAND,
  unread:            BRAND,
  avatar:            "#DDD7C9",

  // ── Semantic status (reflected from STATUS for component convenience) ────────
  success:           STATUS.success,
  successSubtle:     STATUS.successSubtle,
  warning:           STATUS.warning,
  warningSubtle:     STATUS.warningSubtle,
  error:             STATUS.error,
  errorSubtle:       STATUS.errorSubtle,
  info:              STATUS.info,
  infoSubtle:        STATUS.infoSubtle,
} as const;

const dark = {
  // ── Typography ──────────────────────────────────────────────────────────────
  text:              "#FFF8F0",
  textSecondary:     "#AAAAAA",
  textMuted:         "#717171",

  // ── Backgrounds — based on the welcome/onboarding deep-space dark (#06080F) ─
  background:        "#06080F",
  backgroundSecondary: "#0C1018",
  backgroundTertiary:  "#111520",
  surface:           "#06080F",
  card:              "#0C1018",

  // ── Lines ───────────────────────────────────────────────────────────────────
  border:            "rgba(255,255,255,0.10)",
  separator:         "rgba(255,255,255,0.07)",

  // ── Interactive ─────────────────────────────────────────────────────────────
  accent:            BRAND,
  tint:              BRAND,
  tabIconDefault:    "#717171",
  tabIconSelected:   BRAND,

  // ── Icons ───────────────────────────────────────────────────────────────────
  icon:              "#AEAEB2",
  iconMuted:         "#636366",

  // ── Chat bubbles ────────────────────────────────────────────────────────────
  bubble:            BRAND,
  bubbleText:        "#FFFFFF",
  bubbleIncoming:    "#0F1422",
  bubbleIncomingText:"#F1F1F1",

  // ── Form inputs — glass style matching auth screens ──────────────────────────
  inputBg:           "rgba(255,255,255,0.06)",

  // ── Glass surface tokens (match login / welcome glass aesthetic) ─────────────
  glassBg:           "rgba(255,255,255,0.08)",
  glassBgSubtle:     "rgba(255,255,255,0.05)",

  // ── Navigation ──────────────────────────────────────────────────────────────
  header:            "#06080F",

  // ── Badges ──────────────────────────────────────────────────────────────────
  badgeBg:           STATUS.error,
  badgeText:         "#FFFFFF",

  // ── Presence ────────────────────────────────────────────────────────────────
  online:            BRAND,
  unread:            BRAND,
  avatar:            "#131620",

  // ── Semantic status (reflected from STATUS for component convenience) ────────
  success:           STATUS.success,
  successSubtle:     STATUS.successSubtle,
  warning:           STATUS.warning,
  warningSubtle:     STATUS.warningSubtle,
  error:             STATUS.error,
  errorSubtle:       STATUS.errorSubtle,
  info:              STATUS.info,
  infoSubtle:        STATUS.infoSubtle,
} as const;

export default {
  // ── Raw brand palette ───────────────────────────────────────────────────────
  brand:      BRAND,
  brandDark:  BRAND_DARK,
  blue:       BRAND_BLUE,
  gold:       GOLD,

  // ── Status (theme-independent) ──────────────────────────────────────────────
  status:     STATUS,

  // ── Theme palettes ──────────────────────────────────────────────────────────
  light,
  dark,
};
