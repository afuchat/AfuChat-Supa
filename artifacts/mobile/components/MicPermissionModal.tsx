// ---- MicPermissionModal -------------------------------------------------------
// Bottom-sheet modal shown when microphone permission is permanently blocked.
// Provides platform-specific re-enable guidance:
//   - Native (iOS / Android): steps + "Open Settings" button.
//   - Web: browser-detected instructions ("Got it" to dismiss).
// -------------------------------------------------------------------------------

import React, { useEffect, useRef } from "react";
import {
  Animated,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { openMicSettings } from "@/lib/micPermission";
import { GLASS } from "@/constants/glass";

interface Props {
  visible: boolean;
  onClose: () => void;
}

// ---- Browser detection (web only) --------------------------------------------

interface BrowserInstructions {
  browser: string;
  steps: string[];
}

function getWebInstructions(): BrowserInstructions {
  if (typeof navigator === "undefined") {
    return {
      browser: "your browser",
      steps: ["Allow microphone in browser settings, then reload."],
    };
  }
  const ua = navigator.userAgent;

  if (ua.includes("Edg/")) {
    return {
      browser: "Microsoft Edge",
      steps: [
        "Click the lock icon in the address bar.",
        'Select "Permissions for this site".',
        'Set Microphone to "Allow".',
        "Reload the page and try again.",
      ],
    };
  }

  if (ua.includes("Chrome")) {
    return {
      browser: "Chrome",
      steps: [
        "Click the lock (or camera) icon in the address bar.",
        'Click "Site settings".',
        'Set Microphone to "Allow".',
        "Reload the page and try again.",
      ],
    };
  }

  if (ua.includes("Firefox")) {
    return {
      browser: "Firefox",
      steps: [
        "Click the lock icon in the address bar.",
        'Click "Connection Secure" then "More information".',
        'Open the "Permissions" tab.',
        'Remove the block next to "Use the Microphone".',
        "Reload the page and try again.",
      ],
    };
  }

  if (ua.includes("Safari")) {
    return {
      browser: "Safari",
      steps: [
        'Open the Safari menu and choose "Settings for This Website".',
        'Set Microphone to "Allow".',
        "Reload the page and try again.",
      ],
    };
  }

  return {
    browser: "your browser",
    steps: [
      "Open browser Settings > Permissions > Microphone.",
      "Allow microphone access for this site.",
      "Reload the page and try again.",
    ],
  };
}

// ---- Component ---------------------------------------------------------------

export function MicPermissionModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const slideY = useRef(new Animated.Value(300)).current;
  const fadeOv = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeOv, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideY, {
          toValue: 0,
          damping: 22,
          stiffness: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      slideY.setValue(300);
      fadeOv.setValue(0);
    }
  }, [visible]);

  const isWeb = Platform.OS === "web";
  const webInfo = isWeb ? getWebInstructions() : null;

  const title = "Microphone access blocked";
  const bodyText = isWeb
    ? (webInfo!.browser + " has blocked the microphone for this site. Follow the steps below to re-enable it.")
    : "AfuChat needs microphone permission to make voice calls. Grant access in your device settings.";

  const handlePrimaryAction = () => {
    if (!isWeb) openMicSettings();
    onClose();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      {/* Dim overlay — tap outside to close */}
      <Animated.View style={[StyleSheet.absoluteFill, s.overlay, { opacity: fadeOv }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Slide-up sheet */}
      <Animated.View
        style={[
          s.sheetWrap,
          { transform: [{ translateY: slideY }], paddingBottom: insets.bottom + 16 },
        ]}
      >
        <BlurView intensity={GLASS.blur.heavy} tint="dark" style={s.sheet}>
          <View style={s.sheetInner}>
            {/* Specular top edge */}
            <View style={s.specular} />

            {/* Drag pill */}
            <View style={s.pill} />

            {/* Icon badge */}
            <View style={s.iconBadge}>
              <Ionicons name="mic-off" size={28} color="#FF3B30" />
            </View>

            {/* Text */}
            <Text style={s.title}>{title}</Text>
            <Text style={s.body}>{bodyText}</Text>

            {/* Steps (web) */}
            {isWeb &&
              webInfo!.steps.map((step, i) => (
                <View key={i} style={s.stepRow}>
                  <View style={s.stepNum}>
                    <Text style={s.stepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={s.stepText}>{step}</Text>
                </View>
              ))}

            {/* Settings path (native) */}
            {!isWeb && (
              <View style={s.stepRow}>
                <Ionicons
                  name="settings-outline"
                  size={16}
                  color="rgba(255,255,255,0.45)"
                  style={{ marginTop: 1 }}
                />
                <Text style={[s.stepText, { marginLeft: 10 }]}>
                  {"Settings > AfuChat > Microphone > Allow"}
                </Text>
              </View>
            )}

            {/* Divider */}
            <View style={s.divider} />

            {/* Buttons */}
            <View style={s.btnRow}>
              <TouchableOpacity style={s.btnSecondary} onPress={onClose} activeOpacity={0.72}>
                <Text style={s.btnSecondaryText}>Dismiss</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.btnPrimary}
                onPress={handlePrimaryAction}
                activeOpacity={0.82}
              >
                {!isWeb && (
                  <Ionicons name="settings-outline" size={15} color="#fff" />
                )}
                <Text style={s.btnPrimaryText}>
                  {isWeb ? "Got it" : "Open Settings"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </BlurView>
      </Animated.View>
    </Modal>
  );
}

// ---- Styles ------------------------------------------------------------------

const s = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  sheetWrap: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.4,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: -6 },
      },
      android: { elevation: 20 },
      web: { boxShadow: "0 -6px 32px rgba(0,0,0,0.50)" } as any,
    }),
  },

  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    borderWidth: 0.5,
    borderBottomWidth: 0,
    borderColor: GLASS.border.dark,
  },

  sheetInner: {
    backgroundColor: GLASS.fill.dark,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 8,
  },

  specular: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.16)",
  },

  pill: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.20)",
    marginBottom: 24,
  },

  iconBadge: {
    alignSelf: "center",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,59,48,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.35)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },

  title: {
    color: "#fff",
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 10,
  },

  body: {
    color: "rgba(255,255,255,0.60)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },

  stepRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },

  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(10,110,255,0.25)",
    borderWidth: 0.5,
    borderColor: "rgba(10,110,255,0.50)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    marginTop: 1,
    flexShrink: 0,
  },

  stepNumText: {
    color: "rgba(130,190,255,0.90)",
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },

  stepText: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    flex: 1,
  },

  divider: {
    height: 0.5,
    backgroundColor: "rgba(255,255,255,0.10)",
    marginVertical: 16,
  },

  btnRow: {
    flexDirection: "row",
    gap: 10,
  },

  btnSecondary: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },

  btnSecondaryText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },

  btnPrimary: {
    flex: 2,
    height: 46,
    borderRadius: 14,
    backgroundColor: "#0A6EFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
    ...Platform.select({
      ios: {
        shadowColor: "#0A6EFF",
        shadowOpacity: 0.50,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
      },
      android: { elevation: 6 },
      web: { boxShadow: "0 4px 16px rgba(10,110,255,0.45)" } as any,
    }),
  },

  btnPrimaryText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
