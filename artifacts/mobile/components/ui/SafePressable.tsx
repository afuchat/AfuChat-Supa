/**
 * SafePressable & SafeTouchableOpacity
 *
 * Drop-in replacements for React Native's Pressable and TouchableOpacity
 * that enforce the global navigation lock from `lib/navUtils`.
 *
 * On press:
 *  1. The global lock is checked — if already locked, the press is ignored.
 *  2. The lock is acquired for NAV_COOLDOWN_MS.
 *  3. The component visually dims itself for the cooldown duration.
 *  4. The original `onPress` handler is called.
 *
 * Usage:
 *   import { SafePressable, SafeTouchableOpacity } from "@/components/ui/SafePressable";
 *
 *   // Exact same API as Pressable / TouchableOpacity — just swap the import.
 *   <SafePressable onPress={() => safeRouter.push("/profile")} style={...} />
 *   <SafeTouchableOpacity onPress={() => navigate("/apps")} activeOpacity={0.8} />
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Pressable,
  TouchableOpacity,
  type PressableProps,
  type TouchableOpacityProps,
} from "react-native";
import { acquireNavLock, navActionKeyForHandler, NAV_COOLDOWN_MS } from "@/lib/navUtils";

// ── SafePressable ─────────────────────────────────────────────────────────────

export interface SafePressableProps extends PressableProps {
  /** Cooldown in ms. Defaults to NAV_COOLDOWN_MS (250). */
  cooldown?: number;
}

export function SafePressable({
  onPress,
  cooldown = NAV_COOLDOWN_MS,
  disabled,
  style,
  ...rest
}: SafePressableProps) {
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handlePress = useCallback(
    (e: any) => {
      if (locked) return;
      if (!onPress) return;
       if (!acquireNavLock(cooldown, navActionKeyForHandler(onPress))) return;

      setLocked(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { setLocked(false); timerRef.current = null; }, cooldown);

      (onPress as any)(e);
    },
    [locked, onPress, cooldown],
  );

  const resolvedStyle = useCallback(
    (state: any) => {
      const base = typeof style === "function" ? style(state) : style;
      return locked ? [base, { opacity: 0.45 }] : base;
    },
    [locked, style],
  );

  return (
    <Pressable
      {...rest}
      style={resolvedStyle}
      disabled={disabled || locked}
      onPress={handlePress}
    />
  );
}

// ── SafeTouchableOpacity ──────────────────────────────────────────────────────

export interface SafeTouchableOpacityProps extends TouchableOpacityProps {
  /** Cooldown in ms. Defaults to NAV_COOLDOWN_MS (250). */
  cooldown?: number;
}

export function SafeTouchableOpacity({
  onPress,
  cooldown   = NAV_COOLDOWN_MS,
  disabled,
  activeOpacity = 0.75,
  ...rest
}: SafeTouchableOpacityProps) {
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handlePress = useCallback(
    (e: any) => {
      if (locked) return;
      if (!onPress) return;
       if (!acquireNavLock(cooldown, navActionKeyForHandler(onPress))) return;

      setLocked(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { setLocked(false); timerRef.current = null; }, cooldown);

      (onPress as any)(e);
    },
    [locked, onPress, cooldown],
  );

  return (
    <TouchableOpacity
      {...rest}
      disabled={disabled || locked}
      activeOpacity={locked ? 1 : activeOpacity}
      style={locked ? [rest.style, { opacity: 0.45 }] : rest.style}
      onPress={handlePress}
    />
  );
}
