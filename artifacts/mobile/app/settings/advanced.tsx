import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useAdvancedFeatures } from "@/context/AdvancedFeaturesContext";

export default function AdvancedFeaturesScreen() {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const { features, setFeature } = useAdvancedFeatures();

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Advanced Features" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 48, paddingTop: 4 }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── CHAT ORGANISATION ──────────────────────────────────────── */}
        <SectionLabel label="CHAT ORGANISATION" colors={colors} />
        <Group colors={colors}>
          <TogRow
            colors={colors} accent={accent}
            icon="folder-outline" bg="#007AFF"
            label="Chat Folders"
            desc="Organise chats into Personal, Groups, Channels and Unread tabs"
            value={features.chat_folders}
            onChange={(v) => setFeature("chat_folders", v)}
          />
          <Sep color={colors.border} />
          <TogRow
            colors={colors} accent={accent}
            icon="pin-outline" bg="#FF9500"
            label="Offline Drafts"
            desc="Save unsent messages locally so you never lose them"
            value={features.offline_drafts}
            onChange={(v) => setFeature("offline_drafts", v)}
          />
        </Group>

        {/* ── VOICE & AUDIO ─────────────────────────────────────────── */}
        <SectionLabel label="VOICE & AUDIO" colors={colors} />
        <Group colors={colors}>
          <TogRow
            colors={colors} accent={accent}
            icon="mic-outline" bg="#34C759"
            label="Voice to Text"
            desc="Transcribe voice messages to text with a tap"
            value={features.voice_to_text}
            onChange={(v) => setFeature("voice_to_text", v)}
          />
          <Sep color={colors.border} />
          <TogRow
            colors={colors} accent={accent}
            icon="volume-high-outline" bg="#5856D6"
            label="Text to Speech"
            desc="Have received messages read aloud to you"
            value={features.text_to_speech}
            onChange={(v) => setFeature("text_to_speech", v)}
          />
        </Group>

        {/* ── AI FEATURES ───────────────────────────────────────────── */}
        <SectionLabel label="AI FEATURES" colors={colors} />
        <Group colors={colors}>
          <TogRow
            colors={colors} accent={accent}
            icon="sparkles-outline" bg="#FF2D55"
            label="Chat Summary"
            desc="AI-generated summary of any conversation from the ⋮ menu"
            value={features.chat_summary}
            onChange={(v) => setFeature("chat_summary", v)}
          />
          <Sep color={colors.border} />
          <TogRow
            colors={colors} accent={accent}
            icon="language-outline" bg="#007AFF"
            label="Message Translation"
            desc="Translate any message to your preferred language"
            value={features.message_translation}
            onChange={(v) => setFeature("message_translation", v)}
          />
          {features.message_translation && (
            <>
              <Sep color={colors.border} />
              <TouchableOpacity
                style={s.row}
                onPress={() => router.push("/language-settings")}
                activeOpacity={0.7}
              >
                <View style={[s.iconBadge, { backgroundColor: "#007AFF" + "22" }]}>
                  <Ionicons name="earth-outline" size={16} color="#007AFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowLabel, { color: colors.text }]}>Translation Language</Text>
                  <Text style={[s.rowDesc, { color: colors.textMuted }]}>Choose target language for translations</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            </>
          )}
        </Group>

        {/* ── MESSAGING ─────────────────────────────────────────────── */}
        <SectionLabel label="MESSAGING" colors={colors} />
        <Group colors={colors}>
          <TogRow
            colors={colors} accent={accent}
            icon="person-circle-outline" bg="#FF9500"
            label="Mini Profile Popup"
            desc="Tap an avatar in chat to see a quick profile preview"
            value={features.mini_profile_popup}
            onChange={(v) => setFeature("mini_profile_popup", v)}
          />
          <Sep color={colors.border} />
          <TogRow
            colors={colors} accent={accent}
            icon="create-outline" bg="#34C759"
            label="Message Edit History"
            desc="See the original text of edited messages"
            value={features.message_edit_history}
            onChange={(v) => setFeature("message_edit_history", v)}
          />
          <Sep color={colors.border} />
          <TogRow
            colors={colors} accent={accent}
            icon="at-outline" bg="#5856D6"
            label="User Tagging"
            desc="Tag people in group chats with @mention"
            value={features.user_tagging}
            onChange={(v) => setFeature("user_tagging", v)}
          />
          <Sep color={colors.border} />
          <TogRow
            colors={colors} accent={accent}
            icon="link-outline" bg="#FF2D55"
            label="Interactive Link Previews"
            desc="Rich previews with images for links shared in chat"
            value={features.interactive_link_preview}
            onChange={(v) => setFeature("interactive_link_preview", v)}
          />
          {Platform.OS !== "web" && (
            <>
              <Sep color={colors.border} />
              <TogRow
                colors={colors} accent={accent}
                icon="cloud-upload-outline" bg="#007AFF"
                label="Drag & Drop Upload"
                desc="Drag files directly into the chat to send them"
                value={features.drag_drop_upload}
                onChange={(v) => setFeature("drag_drop_upload", v)}
              />
            </>
          )}
        </Group>

        {/* ── NOTIFICATIONS & FOCUS ─────────────────────────────────── */}
        <SectionLabel label="NOTIFICATIONS & FOCUS" colors={colors} />
        <Group colors={colors}>
          <TogRow
            colors={colors} accent={accent}
            icon="notifications-outline" bg="#FF9500"
            label="Smart Notifications"
            desc="Intelligent filtering to surface only important alerts"
            value={features.smart_notifications}
            onChange={(v) => setFeature("smart_notifications", v)}
          />
          <Sep color={colors.border} />
          <TogRow
            colors={colors} accent={accent}
            icon="moon-outline" bg="#5856D6"
            label="Focus Mode"
            desc="Pause all non-urgent notifications and appear offline"
            value={features.focus_mode}
            onChange={(v) => setFeature("focus_mode", v)}
          />
          <Sep color={colors.border} />
          <TogRow
            colors={colors} accent={accent}
            icon="alarm-outline" bg="#FF2D55"
            label="Message Reminders"
            desc="Set a reminder to reply to any message later"
            value={features.message_reminders}
            onChange={(v) => setFeature("message_reminders", v)}
          />
          <Sep color={colors.border} />
          <TogRow
            colors={colors} accent={accent}
            icon="key-outline" bg="#34C759"
            label="Keyword Alerts"
            desc="Get notified when specific words appear in a chat"
            value={features.keyword_alerts}
            onChange={(v) => setFeature("keyword_alerts", v)}
          />
        </Group>

        {/* ── PRIVACY ───────────────────────────────────────────────── */}
        <SectionLabel label="PRIVACY" colors={colors} />
        <Group colors={colors}>
          <TogRow
            colors={colors} accent={accent}
            icon="chatbox-ellipses-outline" bg="#8E8E93"
            label="Auto-Reply"
            desc="Automatically reply when you're away"
            value={features.auto_reply_enabled}
            onChange={(v) => setFeature("auto_reply_enabled", v)}
          />
          <Sep color={colors.border} />
          <TogRow
            colors={colors} accent={accent}
            icon="timer-outline" bg="#FF3B30"
            label="Temporary Chats"
            desc="Start chats that auto-delete after a set time"
            value={features.temp_chat_enabled}
            onChange={(v) => setFeature("temp_chat_enabled", v)}
          />
        </Group>

        <View style={s.footer}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
          <Text style={[s.footerText, { color: colors.textMuted }]}>
            Features are saved instantly and sync across your devices.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

function SectionLabel({ label, colors }: { label: string; colors: any }) {
  return (
    <Text style={[s.sectionLabel, { color: colors.textMuted }]}>{label}</Text>
  );
}

function Sep({ color }: { color: string }) {
  return <View style={[s.sep, { backgroundColor: color }]} />;
}

function Group({ colors, children }: { colors: any; children: React.ReactNode }) {
  return (
    <View style={[s.group, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

function TogRow({
  colors, accent, icon, bg, label, desc, value, onChange,
}: {
  colors: any; accent: string; icon: string; bg: string;
  label: string; desc: string; value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <View style={s.row}>
      <View style={[s.iconBadge, { backgroundColor: bg }]}>
        <Ionicons name={icon as any} size={16} color="#fff" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.rowLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[s.rowDesc, { color: colors.textMuted }]}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: accent, false: colors.border }}
        thumbColor="#fff"
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.9,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 8,
  },

  group: {
    marginHorizontal: 16,
    borderRadius: 18,
    borderWidth: 0.5,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
    }),
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
    minHeight: 60,
  },

  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },

  rowLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },

  rowDesc: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
    lineHeight: 16,
  },

  sep: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 60,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 20,
    marginTop: 24,
    marginBottom: 8,
  },

  footerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 17,
  },
});
