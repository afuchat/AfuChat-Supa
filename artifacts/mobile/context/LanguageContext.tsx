import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { translateText, LANG_LABELS } from "@/lib/translate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
  setCurrentUiLanguage,
  subscribeUiTranslations,
  translateUi,
} from "@/lib/uiTranslations";
import { isBundledUiLanguage } from "@/lib/uiTranslations";
import { storage, KEYS } from "@/lib/storage/mmkv";

export const LANGUAGE_PREFERENCE_KEY = "@afuchat:lang_pref";

function normalizeLanguage(value: string | null | undefined): string | null {
  if (!value || value === "none") return null;
  const normalized = value.trim().toLowerCase().replace("_", "-");
  const aliases: Record<string, string> = {
    english: "en",
    swahili: "sw",
    kiswahili: "sw",
    french: "fr",
    français: "fr",
    spanish: "es",
    español: "es",
    arabic: "ar",
    العربية: "ar",
  };
  return aliases[normalized] ?? normalized.split("-")[0];
}

type LanguageContextType = {
  preferredLang: string | null;
  langLabel: string;
  isRTL: boolean;
  setPreferredLang: (lang: string | null) => Promise<void>;
  autoTranslate: (text: string) => Promise<string>;
  voiceToText: boolean;
  textToSpeech: boolean;
  t: (text: string) => string;
};

const LanguageContext = createContext<LanguageContextType>({
  preferredLang: null,
  langLabel: "Off",
  isRTL: false,
  setPreferredLang: async () => {},
  autoTranslate: async (t) => t,
  voiceToText: false,
  textToSpeech: false,
  t: (text) => text,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [preferredLang, setPreferredLangState] = useState<string | null>(() => {
    try {
      const cached = normalizeLanguage(storage.getString(KEYS.LANGUAGE));
      return cached && isBundledUiLanguage(cached) ? cached : null;
    } catch {
      return null;
    }
  });
  const [voiceToText, setVoiceToText] = useState(false);
  const [textToSpeech, setTextToSpeech] = useState(false);
  const [uiTranslationVersion, setUiTranslationVersion] = useState(0);
  const userRef = useRef(user);
  const hasLocalLanguageChange = useRef(false);
  userRef.current = user;

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY).then((stored) => {
      const lang = normalizeLanguage(stored);
      if (stored === null) return;
      if (hasLocalLanguageChange.current) return;
      const safeLang = lang && !isBundledUiLanguage(lang) ? "en" : lang;
      setPreferredLangState(safeLang);
      setCurrentUiLanguage(safeLang);
    });
  }, []);

  async function fetchSettings(uid: string) {
    const [{ data: featureData }, { data: profileData }] = await Promise.all([
      supabase
        .from("advanced_feature_settings")
        .select("voice_to_text, text_to_speech")
        .eq("user_id", uid)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("language")
        .eq("id", uid)
        .maybeSingle(),
    ]);

    // A device preference is authoritative when it exists. On a new device,
    // restore the app language saved on the user's profile instead of using
    // the message-translation toggle as a proxy for the whole UI.
    const stored = await AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY);
    if (!hasLocalLanguageChange.current) {
      const requestedLang = stored !== null
        ? normalizeLanguage(stored)
        : normalizeLanguage(profileData?.language) ?? "en";
      const lang = requestedLang && !isBundledUiLanguage(requestedLang)
        ? "en"
        : requestedLang;
      setPreferredLangState(lang);
      setCurrentUiLanguage(lang);
      await AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, lang ?? "none");
      try {
        storage.setString(KEYS.LANGUAGE, lang ?? "en");
      } catch {}
    }
    setVoiceToText(!!featureData?.voice_to_text);
    setTextToSpeech(!!featureData?.text_to_speech);
  }

  useEffect(() => {
    if (!user) return;
    fetchSettings(user.id).catch(() => {});
  }, [user]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && userRef.current) {
        fetchSettings(userRef.current.id).catch(() => {});
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => subscribeUiTranslations(() => {
    setUiTranslationVersion((version) => version + 1);
  }), []);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`lang_watch_${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "advanced_feature_settings",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          setVoiceToText(!!row.voice_to_text);
          setTextToSpeech(!!row.text_to_speech);
        }
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [user]);

  async function setPreferredLang(lang: string | null) {
    hasLocalLanguageChange.current = true;
    const requestedLang = normalizeLanguage(lang);
    const normalizedLang = requestedLang && !isBundledUiLanguage(requestedLang)
      ? "en"
      : requestedLang;
    setPreferredLangState(normalizedLang);
    setCurrentUiLanguage(normalizedLang);
    await AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, normalizedLang ?? "none");
    try {
      storage.setString(KEYS.LANGUAGE, normalizedLang ?? "en");
    } catch {}
    if (user) {
      await Promise.all([
        supabase.from("profiles").update({ language: normalizedLang ?? "en" }).eq("id", user.id),
        supabase.from("advanced_feature_settings").upsert(
          {
            user_id: user.id,
            message_translation: !!normalizedLang,
            translation_language: normalizedLang ?? "en",
          },
          { onConflict: "user_id" },
        ),
      ]);
    }
  }

  async function autoTranslate(text: string): Promise<string> {
    if (!preferredLang || !text?.trim()) return text;
    return translateText(text, preferredLang);
  }

  const langLabel = preferredLang
    ? (LANG_LABELS[preferredLang] ?? preferredLang)
    : "Off";
  // Arabic UI copy is translated, but the product intentionally keeps the
  // existing left-to-right layout and navigation structure unchanged.
  const isRTL = false;
  // Keep non-hook callers used by the Babel transform in sync during the same
  // render that observes a language change, not one render later.
  setCurrentUiLanguage(preferredLang);
  const t = useCallback(
    (text: string) => translateUi(text, preferredLang),
    [preferredLang, uiTranslationVersion],
  );

  return (
    <LanguageContext.Provider
      value={{ preferredLang, langLabel, isRTL, setPreferredLang, autoTranslate, voiceToText, textToSpeech, t }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function useAutoTranslate(text: string | null | undefined) {
  const { preferredLang } = useLanguage();
  const [displayText, setDisplayText] = useState(text || "");
  const [isTranslated, setIsTranslated] = useState(false);

  useEffect(() => {
    setDisplayText(text || "");
    setIsTranslated(false);
    if (!preferredLang || !text?.trim()) return;
    let cancelled = false;
    translateText(text, preferredLang).then((result) => {
      if (!cancelled && result && result !== text) {
        setDisplayText(result);
        setIsTranslated(true);
      }
    });
    return () => { cancelled = true; };
  }, [preferredLang, text]);

  return { displayText, isTranslated, lang: preferredLang };
}
