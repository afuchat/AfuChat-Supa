import React, { forwardRef, useMemo } from "react";
import {
  Text as NativeText,
  type TextProps,
  type TextStyle,
} from "react-native";
import { useLanguage } from "@/context/LanguageContext";

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
const LocalizedText = forwardRef<NativeText, TextProps>(function LocalizedText(
  { children, ...props },
  ref,
) {
  const { t } = useLanguage();
  const localizedChildren = useMemo(
    () => localizeChildren(children, t),
    [children, t],
  );

  return (
    <NativeText ref={ref} {...props}>
      {localizedChildren}
    </NativeText>
  );
});

LocalizedText.displayName = "LocalizedText";

export default LocalizedText;