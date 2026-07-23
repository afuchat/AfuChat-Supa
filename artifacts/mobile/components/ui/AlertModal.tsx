import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
const ND = true;
import {
  registerAlertListener,
  unregisterAlertListener,
  type AlertButton,
} from "@/lib/alert";
import { useTheme } from "@/hooks/useTheme";
import { T } from "@/constants/theme";
import { STATUS } from "@/constants/colors";

type AlertState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons?: AlertButton[];
};

export default function AlertModal() {
  const { colors, isDark } = useTheme();
  const [state, setState] = useState<AlertState>({ visible: false, title: "" });
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    registerAlertListener((s) => setState(s));
    return () => unregisterAlertListener();
  }, []);

  useEffect(() => {
    if (state.visible) {
      Animated.parallel([
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: ND,
          ...T.motion.spring.snappy,
        }),
        Animated.timing(opacity, { toValue: 1, duration: T.motion.fast, useNativeDriver: ND }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(scale, { toValue: 0.88, duration: T.motion.fast - 20, useNativeDriver: ND }),
        Animated.timing(opacity, { toValue: 0, duration: T.motion.fast - 20, useNativeDriver: ND }),
      ]).start();
    }
  }, [state.visible]);

  const dismiss = useCallback((btn?: AlertButton) => {
    setState((s) => ({ ...s, visible: false }));
    setTimeout(() => btn?.onPress?.(), T.motion.base);
  }, []);

  const buttons: AlertButton[] =
    state.buttons && state.buttons.length > 0
      ? state.buttons
      : [{ text: "OK", style: "default" }];

  const cancelBtn = buttons.find((b) => b.style === "cancel");
  const useVertical = buttons.length > 2;

  // Use theme surface colors — no hardcoded hex
  const cardBg = isDark ? colors.backgroundTertiary : colors.surface;
  const divider = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.09)";

  return (
    <Modal
      visible={state.visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => dismiss(cancelBtn)}
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => dismiss(cancelBtn)}
        />
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: cardBg, opacity, transform: [{ scale }] },
          ]}
        >
          {/* Content */}
          <View style={styles.content}>
            <Text style={[styles.title, { color: colors.text }]}>
              {state.title}
            </Text>
            {state.message ? (
              <Text style={[styles.message, { color: colors.textSecondary }]}>
                {state.message}
              </Text>
            ) : null}
          </View>

          {/* Buttons */}
          <View
            style={[
              useVertical ? styles.btnGroupVertical : styles.btnGroupHorizontal,
              { borderTopColor: divider },
            ]}
          >
            {buttons.map((btn, i) => {
              const isDestructive = btn.style === "destructive";
              const isCancel = btn.style === "cancel";
              // All button colors from design tokens — no raw hex
              const btnColor = isDestructive
                ? colors.error
                : isCancel
                ? colors.textSecondary
                : colors.accent;

              return (
                <TouchableOpacity
                  key={i}
                  style={[
                    useVertical ? styles.btnVertical : styles.btnHorizontal,
                    !useVertical && i < buttons.length - 1 && {
                      borderRightWidth: T.border.hairline,
                      borderRightColor: divider,
                    },
                    useVertical && i < buttons.length - 1 && {
                      borderBottomColor: divider,
                    },
                  ]}
                  onPress={() => dismiss(btn)}
                  activeOpacity={T.states.pressed}
                >
                  <Text
                    style={[
                      styles.btnText,
                      { color: btnColor },
                      !isCancel && { fontFamily: "Inter_600SemiBold" },
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.48)",
    padding: T.space.huge - 8,
  },
  card: {
    width: 288,
    borderRadius: T.radius.lg,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 24px 32px rgba(0,0,0,0.28)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 24 },
        shadowOpacity: 0.28,
        shadowRadius: 32,
        elevation: T.elevation.overlay,
      },
    }),
  },
  content: {
    paddingTop: T.space.xxl,
    paddingBottom: T.space.lg + 2,
    paddingHorizontal: T.space.xl,
    alignItems: "center",
    gap: 7,
  },
  title: {
    ...T.title,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  message: {
    ...T.caption,
    textAlign: "center",
  },
  btnGroupHorizontal: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btnGroupVertical: {
    flexDirection: "column",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  btnHorizontal: {
    flex: 1,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  btnVertical: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  btnText: {
    ...T.body,
    fontFamily: "Inter_400Regular",
  },
});
