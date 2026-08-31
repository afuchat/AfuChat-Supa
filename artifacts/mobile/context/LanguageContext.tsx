import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { translateText, LANG_LABELS } from "@/lib/translate";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { setCurrentUiLanguage, translateUi } from "@/lib/uiTranslations";

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
  const [preferredLang, setPreferredLangState] = useState<string | null>(null);
  const [voiceToText, setVoiceToText] = useState(false);
  const [textToSpeech, setTextToSpeech] = useState(false);
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_PREFERENCE_KEY).then((stored) => {
      const lang = normalizeLanguage(stored);
      if (lang) setPreferredLangState(lang);
    });
  }, []);

  async function fetchSettings(uid: string) {
    const { data } = await supabase
      .from("advanced_feature_settings")
      .select("message_translation, translation_language, voice_to_text, text_to_speech")
      .eq("user_id", uid)
      .maybeSingle();
    if (!data) return;
    const lang =
      data.message_translation && data.translation_language
        ? normalizeLanguage(data.translation_language)
        : null;
    setPreferredLangState(lang);
    AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, lang ?? "none");
    setVoiceToText(!!data.voice_to_text);
    setTextToSpeech(!!data.text_to_speech);
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
          const lang =
            row.message_translation && row.translation_language
              ? normalizeLanguage(row.translation_language)
              : null;
          setPreferredLangState(lang);
          AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, lang ?? "none");
          setVoiceToText(!!row.voice_to_text);
          setTextToSpeech(!!row.text_to_speech);
        }
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [user]);

  async function setPreferredLang(lang: string | null) {
    const normalizedLang = normalizeLanguage(lang);
    setPreferredLangState(normalizedLang);
    await AsyncStorage.setItem(LANGUAGE_PREFERENCE_KEY, normalizedLang ?? "none");
    if (user) {
      await supabase.from("advanced_feature_settings").upsert(
        {
          user_id: user.id,
          message_translation: !!normalizedLang,
          translation_language: normalizedLang ?? "en",
        },
        { onConflict: "user_id" }
      );
    }
  }

  async function autoTranslate(text: string): Promise<string> {
    if (!preferredLang || !text?.trim()) return text;
    return translateText(text, preferredLang);
  }

  const langLabel = preferredLang
    ? (LANG_LABELS[preferredLang] ?? preferredLang)
    : "Off";
  const isRTL = preferredLang === "ar";
  useEffect(() => {
    setCurrentUiLanguage(preferredLang);
  }, [preferredLang]);
  const t = (text: string) => translateUi(text, preferredLang);

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
