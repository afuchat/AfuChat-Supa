import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { showToast } from "@/lib/toast";
import {
  getNotificationPreferences,
  saveNotificationPreferences,
  setNotificationsEnabled,
  type NotificationPreferences,
} from "@/lib/notificationPreferences";

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  colors,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={[styles.row, { borderBottomColor: colors.separator }]}>
      <View style={[styles.iconBox, { backgroundColor: colors.backgroundSecondary }]}>
        <Ionicons name={icon} size={19} color={colors.text} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.rowSubtitle, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.accent + "80" }}
        thumbColor={value ? colors.accent : colors.textMuted}
        ios_backgroundColor={colors.border}
      />
    </View>
  );
}

export default function NotificationSettingsScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [preferences, setPreferences] = useState<NotificationPreferences>(getNotificationPreferences);
  const [savingEnabled, setSavingEnabled] = useState(false);

  useEffect(() => {
    setPreferences(getNotificationPreferences());
  }, [user?.id]);

  const update = useCallback((patch: Partial<NotificationPreferences>) => {
    const next = saveNotificationPreferences(patch);
    setPreferences(next);
  }, []);

  const toggleEnabled = useCallback(async (enabled: boolean) => {
    setPreferences((current) => ({ ...current, enabled }));
    setSavingEnabled(true);
    await setNotificationsEnabled(enabled);
    setPreferences(getNotificationPreferences());
    setSavingEnabled(false);
    showToast(enabled ? "Notifications enabled" : "Notifications paused", {
      type: "success",
      icon: enabled ? "notifications" : "notifications-off",
    });
  }, []);

  const openSystemSettings = useCallback(() => {
    if (Platform.OS === "web") {
      showToast("Browser notification controls are managed by your browser", { type: "info" });
      return;
    }
    Linking.openSettings().catch(() => {});
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Notifications" onBack={() => router.back()} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: colors.card }]}>
          <View style={[styles.heroIcon, { backgroundColor: colors.accent + "18" }]}>
            <Ionicons name="notifications" size={24} color={colors.accent} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={[styles.heroTitle, { color: colors.text }]}>Stay in the loop</Text>
            <Text style={[styles.heroSubtitle, { color: colors.textMuted }]}>
              Choose what AfuChat can alert you about. Changes apply instantly on this device.
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>GENERAL</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <SettingRow
            icon="notifications-outline"
            title="Allow notifications"
            subtitle={savingEnabled ? "Updating device permission…" : "Master switch for AfuChat alerts"}
            value={preferences.enabled}
            onValueChange={toggleEnabled}
            disabled={savingEnabled}
            colors={colors}
          />
          <SettingRow
            icon="volume-high-outline"
            title="Notification sounds"
            subtitle="Play a sound for new alerts"
            value={preferences.sounds}
            onValueChange={(value) => update({ sounds: value })}
            disabled={!preferences.enabled}
            colors={colors}
          />
          <SettingRow
            icon="eye-outline"
            title="Show message previews"
            subtitle="Display message text in notification banners"
            value={preferences.previews}
            onValueChange={(value) => update({ previews: value })}
            disabled={!preferences.enabled}
            colors={colors}
          />
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ALERT TYPES</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <SettingRow icon="chatbubble-ellipses-outline" title="Messages" subtitle="New direct and group messages" value={preferences.messages} onValueChange={(value) => update({ messages: value })} disabled={!preferences.enabled} colors={colors} />
          <SettingRow icon="call-outline" title="Calls" subtitle="Incoming and missed calls" value={preferences.calls} onValueChange={(value) => update({ calls: value })} disabled={!preferences.enabled} colors={colors} />
          <SettingRow icon="heart-outline" title="Social activity" subtitle="Likes, follows, replies and mentions" value={preferences.social} onValueChange={(value) => update({ social: value })} disabled={!preferences.enabled} colors={colors} />
          <SettingRow icon="bag-handle-outline" title="Marketplace" subtitle="Orders, payments and delivery updates" value={preferences.marketplace} onValueChange={(value) => update({ marketplace: value })} disabled={!preferences.enabled} colors={colors} />
        </View>

        <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>QUIET HOURS</Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <SettingRow
            icon="moon-outline"
            title="Quiet hours"
            subtitle={`${preferences.quietStart} – ${preferences.quietEnd}. Calls remain visible.`}
            value={preferences.quietHours}
            onValueChange={(value) => update({ quietHours: value })}
            disabled={!preferences.enabled}
            colors={colors}
          />
        </View>

        {Platform.OS !== "web" && (
          <TouchableOpacity style={[styles.systemButton, { borderColor: colors.border }]} onPress={openSystemSettings} activeOpacity={0.75}>
            <Ionicons name="settings-outline" size={18} color={colors.text} />
            <Text style={[styles.systemButtonText, { color: colors.text }]}>Open device notification settings</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
        {savingEnabled && <ActivityIndicator style={styles.loader} color={colors.accent} />}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 12 },
  hero: { flexDirection: "row", alignItems: "center", borderRadius: 18, padding: 16, gap: 12, marginBottom: 24 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1, gap: 3 },
  heroTitle: { fontSize: 17, fontFamily: "Inter_700Bold" },
  heroSubtitle: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  sectionLabel: { fontSize: 11, letterSpacing: 0.7, fontFamily: "Inter_600SemiBold", marginBottom: 8, paddingHorizontal: 4 },
  card: { borderRadius: 18, overflow: "hidden", marginBottom: 20 },
  row: { minHeight: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 11, gap: 11, borderBottomWidth: 0.5 },
  iconBox: { width: 34, height: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rowSubtitle: { fontSize: 12, lineHeight: 16, fontFamily: "Inter_400Regular" },
  systemButton: { minHeight: 52, borderRadius: 15, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 15 },
  systemButtonText: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  loader: { marginTop: 14 },
});