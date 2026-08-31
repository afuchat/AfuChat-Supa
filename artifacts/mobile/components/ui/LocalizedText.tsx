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
): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child === "string") return translate(child);
    if (React.isValidElement(child)) {
      const element = child as React.ReactElement<{ children?: React.ReactNode }>;
      if (!element.props.children) return child;
      return React.cloneElement(element, {
        children: localizeChildren(element.props.children, translate),
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
};

const LocalizedText = forwardRef<NativeText, LocalizedTextProps>(function LocalizedText(
  { children, __afuchatStaticText = false, ...props },
  ref,
) {
  const { preferredLang, t } = useLanguage();
  const sourceText = useMemo(
    () =>
      React.Children.toArray(children)
        .filter((child): child is string => typeof child === "string")
        .join("")
        .trim(),
    [children],
  );
  const [remoteTranslation, setRemoteTranslation] = useState<string | null>(null);

  // The local dictionary handles the most common labels synchronously. For
  // every other static UI string, use the same translation service as message
  // translation so the selected language is not limited to five dictionaries.
  useEffect(() => {
    let cancelled = false;
    setRemoteTranslation(null);
    if (
      !__afuchatStaticText ||
      !sourceText ||
      !preferredLang ||
      preferredLang === "en" ||
      t(sourceText) !== sourceText
    ) {
      return () => {
        cancelled = true;
      };
    }

    translateText(sourceText, preferredLang).then((translated) => {
      if (!cancelled && translated && translated !== sourceText) {
        setRemoteTranslation(translated);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [__afuchatStaticText, preferredLang, sourceText, t]);

  const localizedChildren = useMemo(
    () =>
      remoteTranslation && __afuchatStaticText
        ? remoteTranslation
        : localizeChildren(children, t),
    [children, __afuchatStaticText, remoteTranslation, t],
  );

  return (
    <NativeText ref={ref} {...props}>
      {localizedChildren}
    </NativeText>
  );
});

LocalizedText.displayName = "LocalizedText";

export default LocalizedText;