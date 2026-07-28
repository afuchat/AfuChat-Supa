/**
 * GlassInput — translucent pill input matching the login / register screen
 * glass aesthetic. Extracted from the AuthInput pattern so any screen can
 * use the same look without duplicating styles.
 *
 * Usage:
 *   <GlassInput
 *     icon="mail"
 *     placeholder="Email"
 *     value={email}
 *     onChangeText={setEmail}
 *     accent={accent}
 *   />
 */

import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type GlassInputProps = {
  /** Ionicons icon shown on the left */
  icon?: string;
  placeholder?: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoComplete?: any;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  /** Right-side element (e.g. show/hide password toggle) */
  rightElement?: React.ReactNode;
  /** Appended element rendered below the input on error/success */
  hint?: React.ReactNode;
  /** Brand accent colour for focused border & icon */
  accent?: string;
  style?: StyleProp<ViewStyle>;
  inputRef?: React.RefObject<TextInput>;
  autoFocus?: boolean;
  editable?: boolean;
};

export function GlassInput({
  icon,
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize = "none",
  autoComplete,
  returnKeyType = "next",
  onSubmitEditing,
  rightElement,
  hint,
  accent = "#1f95ff",
  style,
  inputRef,
  autoFocus,
  editable = true,
}: GlassInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={style}>
      <View
        style={[
          s.wrap,
          {
            backgroundColor: focused
              ? "rgba(255,255,255,0.09)"
              : "rgba(255,255,255,0.06)",
            borderColor: focused
              ? accent + "70"
              : "rgba(255,255,255,0.10)",
          },
        ]}
      >
        {!!icon && (
          <Ionicons
            name={icon as any}
            size={17}
            color={focused ? accent : "rgba(255,255,255,0.32)"}
            style={s.icon}
          />
        )}
        <TextInput
          ref={inputRef}
          style={s.text as any}
          placeholder={placeholder}
          placeholderTextColor="rgba(255,255,255,0.25)"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete}
          autoCorrect={false}
          autoFocus={autoFocus}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
        />
        {rightElement}
      </View>
      {hint}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 18,
    height: 56,
    borderWidth: 1,
  },
  icon: { marginRight: 10 },
  text: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    height: 56,
    color: "#F1F1F1",
    outlineStyle: "none" as any,
  },
});
