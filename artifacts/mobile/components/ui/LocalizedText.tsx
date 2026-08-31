import React, { forwardRef, useEffect, useMemo, useState } from "react";
import {
  Text as NativeText,
  type TextProps,
} from "react-native";
import { useLanguage } from "@/context/LanguageContext";
import { translateText } from "@/lib/translate";

function localizeChildren(
  children: React.ReactNode,
  translate: (text: string) => string,
  shouldTranslate: (text: string) => boolean,
  translatedParts: Record<string, string>,
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") {
      if (!shouldTranslate(child)) return child;
      return translatedParts[child] ?? translate(child);
    }
    if (React.isValidElement(child)) {
      const element = child as React.ReactElement<{ children?: React.ReactNode }>;
      if (!element.props.children) return child;
      return React.cloneElement(element, {
        children: localizeChildren(element.props.children, translate, shouldTranslate, translatedParts),
      });
    }
    return child;
  });
}

/**
 * Drop-in Text replacement used by the Babel localization transform.
 * Only text nodes are passed through t(); icons, numbers, links, and other
 * dynamic React elements are left untouched.
 */
type LocalizedTextProps = TextProps & {
  __afuchatStaticText?: boolean;
  __afuchatStaticParts?: string[];
  __afuchatTranslateAllText?: boolean;
};

const LocalizedText = forwardRef<NativeText, LocalizedTextProps>(function LocalizedText(
  {
    children,
    __afuchatStaticText = false,
    __afuchatStaticParts = [],
    __afuchatTranslateAllText = false,
    ...props
  },
  ref,
) {
  const { preferredLang, t } = useLanguage();
  const staticPartKey = __afuchatStaticParts.join("\u0000");
  const candidateTexts = useMemo(() => {
    const staticParts = new Set(__afuchatStaticParts);
    return Array.from(
      new Set(
        React.Children.toArray(children)
          .filter((child): child is string => typeof child === "string")
          .filter((child) => __afuchatTranslateAllText || staticParts.has(child)),
      ),
    );
  }, [children, __afuchatTranslateAllText, staticPartKey]);
  const candidateKey = candidateTexts.join("\u0001");
  const shouldTranslate = useMemo(() => {
    const staticParts = new Set(__afuchatStaticParts);
    return (text: string) => __afuchatTranslateAllText || staticParts.has(text);
  }, [__afuchatTranslateAllText, staticPartKey]);
  const [translatedParts, setTranslatedParts] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    setTranslatedParts((current) =>
      Object.keys(current).length === 0 ? current : {},
    );
    if (!__afuchatStaticText || !preferredLang || preferredLang === "en") {
      return () => {
        cancelled = true;
      };
    }

    const missing = candidateTexts.filter((text) => t(text) === text && text.trim().length >= 2);
    if (missing.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    Promise.all(
      missing.map(async (text) => [text, await translateText(text, preferredLang)] as const),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [source, translated] of results) {
        if (translated && translated !== source) next[source] = translated;
      }
      if (Object.keys(next).length > 0) setTranslatedParts(next);
    });

    return () => {
      cancelled = true;
    };
  }, [
    __afuchatStaticText,
    candidateKey,
    preferredLang,
    t,
  ]);

  const localizedChildren = useMemo(
    () =>
      localizeChildren(
        children,
        t,
        shouldTranslate,
        translatedParts,
      ),
    [children, shouldTranslate, t, translatedParts],
  );

  return (
    <NativeText ref={ref} {...props}>
      {localizedChildren}
    </NativeText>
  );
});

LocalizedText.displayName = "LocalizedText";

export default LocalizedText;