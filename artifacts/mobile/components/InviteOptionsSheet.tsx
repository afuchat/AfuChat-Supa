import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import SwipeableBottomSheet from "@/components/SwipeableBottomSheet";
import { useTheme } from "@/hooks/useTheme";

type Props = {
  visible: boolean;
  onClose: () => void;
  onWhatsApp: () => void;
  onTelegram: () => void;
  onSms: () => void;
};

export default function InviteOptionsSheet({
  visible,
  onClose,
  onWhatsApp,
  onTelegram,
  onSms,
}: Props) {
  const { colors } = useTheme();

  const choose = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <SwipeableBottomSheet
      visible={visible}
      onClose={onClose}
      maxHeight={360}
      backgroundColor={colors.surface}
    >
      <View style={{ padding: 20, gap: 12 }}>
        <View style={{ alignItems: "center", gap: 5, marginBottom: 2 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.separator }} />
          <Text style={{ color: colors.text, fontSize: 18, fontFamily: "Inter_700Bold" }}>
            Invite via
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" }}>
            Choose an app to send your AfuChat invite
          </Text>
        </View>

        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: "#25D366" }}
          onPress={() => choose(onWhatsApp)}
          activeOpacity={0.8}
        >
          <Ionicons name="logo-whatsapp" size={23} color="#fff" />
          <Text style={{ flex: 1, color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>WhatsApp</Text>
          <Ionicons name="chevron-forward" size={19} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: "#229ED9" }}
          onPress={() => choose(onTelegram)}
          activeOpacity={0.8}
        >
          <Ionicons name="paper-plane" size={22} color="#fff" />
          <Text style={{ flex: 1, color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>Telegram</Text>
          <Ionicons name="chevron-forward" size={19} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, backgroundColor: colors.accent }}
          onPress={() => choose(onSms)}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble" size={22} color="#fff" />
          <Text style={{ flex: 1, color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" }}>SMS</Text>
          <Ionicons name="chevron-forward" size={19} color="#fff" />
        </TouchableOpacity>
      </View>
    </SwipeableBottomSheet>
  );
}