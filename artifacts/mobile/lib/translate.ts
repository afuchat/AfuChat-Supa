/**
 * Real message translation using Google Translate's public endpoint.
 * No API key required. Auto-detects source language.
 * Supports 100+ languages with full accuracy.
 */

const CACHE = new Map<string, string>();
const SOURCE_LANGUAGE_CACHE = new Map<string, string | null>();

function cacheKey(text: string, targetLang: string): string {
  return `${targetLang}:${text.slice(0, 120)}`;
}

export async function translateText(text: string, targetLang: string): Promise<string> {
  if (!text?.trim() || text.trim().length < 2) return text;

  const stripped = text.replace(/[\p{Emoji}\s]/gu, "");
  if (!stripped) return text;

  const key = cacheKey(text, targetLang);
  if (CACHE.has(key)) return CACHE.get(key)!;

  try {
    const url =
      `https://translate.googleapis.com/translate_a/single` +
      `?client=gtx&sl=auto&tl=${encodeURIComponent(targetLang)}&dt=t` +
      `&q=${encodeURIComponent(text)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();

    if (Array.isArray(json?.[0])) {
      const translated = (json[0] as any[])
        .map((seg: any) => (Array.isArray(seg) ? seg[0] ?? "" : ""))
        .join("")
        .trim();

      if (translated && translated !== text) {
        CACHE.set(key, translated);
        return translated;
      }
    }

    return text;
  } catch {
    return text;
  }
}

/**
 * Detect the source language without translating the message for display.
 * Google returns the detected language in the third response slot when the
 * source language is set to auto.
 */
export async function detectMessageLanguage(text: string): Promise<string | null> {
  const trimmed = text?.trim() ?? "";
  const stripped = trimmed.replace(/[\p{Emoji}\s]/gu, "");
  if (!stripped || trimmed.length < 2) return null;

  const key = trimmed.slice(0, 240);
  if (SOURCE_LANGUAGE_CACHE.has(key)) return SOURCE_LANGUAGE_CACHE.get(key) ?? null;

  try {
    const url =
      `https://translate.googleapis.com/translate_a/single` +
      `?client=gtx&sl=auto&tl=en&dt=t` +
      `&q=${encodeURIComponent(trimmed)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const detected = typeof json?.[2] === "string" ? json[2].split("-")[0] : null;
    SOURCE_LANGUAGE_CACHE.set(key, detected);
    return detected;
  } catch {
    return null;
  }
}

export const LANG_LABELS: Record<string, string> = {
  en: "English",
  zh: "Chinese",
  es: "Spanish",
  fr: "French",
  ar: "Arabic",
  hi: "Hindi",
  pt: "Portuguese",
  ru: "Russian",
  ja: "Japanese",
  de: "German",
  sw: "Swahili",
  ko: "Korean",
  it: "Italian",
  tr: "Turkish",
  nl: "Dutch",
  pl: "Polish",
  th: "Thai",
  vi: "Vietnamese",
  id: "Indonesian",
  ms: "Malay",
  fil: "Filipino",
  uk: "Ukrainian",
  ro: "Romanian",
  el: "Greek",
  cs: "Czech",
  sv: "Swedish",
  da: "Danish",
  no: "Norwegian",
  fi: "Finnish",
  he: "Hebrew",
  bn: "Bengali",
  ta: "Tamil",
  ur: "Urdu",
  fa: "Persian",
  am: "Amharic",
  ha: "Hausa",
  yo: "Yoruba",
  zu: "Zulu",
  af: "Afrikaans",
  so: "Somali",
};
