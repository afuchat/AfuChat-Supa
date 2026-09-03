/**
 * Local i18n entry point for AfuChat UI copy.
 *
 * This module is intentionally synchronous and bundled with the app. Page
 * labels, buttons, settings, onboarding copy, and alerts must use this API;
 * they must never depend on the Google-backed user-content translator.
 */

import {
  BUNDLED_UI_LANGUAGES,
  isBundledUiLanguage,
  localizeUi,
  registerUiTexts,
  setCurrentUiLanguage,
  subscribeUiTranslations,
  translateUi,
} from "./uiTranslations";

export type { UiLanguage } from "./uiTranslations";
export {
  BUNDLED_UI_LANGUAGES,
  isBundledUiLanguage,
  localizeUi,
  registerUiTexts,
  subscribeUiTranslations,
};

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
  rw: "Kinyarwanda",
  ha: "Hausa",
  yo: "Yoruba",
  zu: "Zulu",
  af: "Afrikaans",
  so: "Somali",
};

/** Translate a bundled UI key synchronously from the local catalog. */
export function t(text: string, language: string | null | undefined): string {
  return translateUi(text, language);
}

/** Update the locale used by non-hook callers, such as transformed JSX. */
export function setLocale(language: string | null): void {
  setCurrentUiLanguage(language);
}