import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useAdvancedFeatures } from "@/context/AdvancedFeaturesContext";
import { useTheme } from "@/hooks/useTheme";
import { getSoundMode, setSoundMode, playNotificationSound, SoundMode } from "@/lib/soundManager";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { patchLocalSetting } from "@/lib/storage/localSettings";
import { BottomSheetContainer, SHEET_OVERLAY_STYLE } from "@/components/ui/BottomSheetContainer";

// ── Types ────────────────────────────────────────────────────────────────────

const NOTIF_KEY_MAP: Partial<Record<string, string>> = {
  push_likes:    "notif_likes",
  push_comments: "notif_comments",
  push_follows:  "notif_follows",
  push_messages: "notif_messages",
  push_mentions: "notif_mentions",
  push_replies:  "notif_comments",
  push_gifts:    "notif_tips",
};

type Prefs = {
  push_enabled: boolean;
  push_messages: boolean;
  push_likes: boolean;
  push_follows: boolean;
  push_gifts: boolean;
  push_mentions: boolean;
  push_replies: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;    // "HH:MM" 24h
  quiet_hours_end: string;      // "HH:MM" 24h
  quiet_hours_timezone: string; // IANA e.g. "Africa/Nairobi"
};

const defaults: Prefs = {
  push_enabled: true,
  push_messages: true,
  push_likes: true,
  push_follows: true,
  push_gifts: true,
  push_mentions: true,
  push_replies: true,
  quiet_hours_enabled: false,
  quiet_hours_start: "22:00",
  quiet_hours_end: "08:00",
  quiet_hours_timezone: "UTC",
};

// ── Time helpers ─────────────────────────────────────────────────────────────

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// "22:30" → { hour12: 10, minute: 30, period: "PM" }
function parse24(time: string): { hour12: number; minute: number; period: "AM" | "PM" } {
  const [hStr, mStr] = time.split(":");
  const h24 = parseInt(hStr ?? "22", 10);
  const minute = parseInt(mStr ?? "00", 10);
  const period: "AM" | "PM" = h24 < 12 ? "AM" : "PM";
  const hour12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  return { hour12, minute, period };
}

// { hour12: 10, minute: 30, period: "PM" } → "22:30"
function format24(hour12: number, minute: number, period: "AM" | "PM"): string {
  let h24 = hour12;
  if (period === "AM") {
    h24 = hour12 === 12 ? 0 : hour12;
  } else {
    h24 = hour12 === 12 ? 12 : hour12 + 12;
  }
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// "22:00" → "10:00 PM"
function display12(time: string): string {
  const { hour12, minute, period } = parse24(time);
  return `${hour12}:${String(minute).padStart(2, "0")} ${period}`;
}

// Short timezone label e.g. "Africa/Nairobi" → "Nairobi"
function shortTz(tz: string): string {
  const parts = tz.split("/");
  return (parts[parts.length - 1] ?? tz).replace(/_/g, " ");
}

// ── Wheel column ─────────────────────────────────────────────────────────────

const ITEM_H = 48;
const VISIBLE = 5; // items visible at once

interface WheelColumnProps {
  items: string[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  colors: ReturnType<typeof import("@/hooks/useTheme").useTheme>["colors"];
  accent: string;
  width: number;
}

function WheelColumn({ items, selectedIndex, onSelect, colors, accent, width }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [dragging, setDragging] = useState(false);

  // Scroll to selected on mount / external change
  useEffect(() => {
    if (dragging) return;
    scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
  }, [selectedIndex, dragging]);

  const handleMomentumEnd = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      setDragging(false);
      onSelect(clamped);
    },
    [items.length, onSelect],
  );

  const handleScrollBegin = useCallback(() => setDragging(true), []);

  const paddingItems = Math.floor(VISIBLE / 2); // 2 phantom items top & bottom

  return (
    <View style={{ width, height: ITEM_H * VISIBLE, overflow: "hidden" }}>
      {/* Selection highlight */}
      <View
        style={[
          wc.highlight,
          {
            pointerEvents: "none",
            top: ITEM_H * paddingItems,
            height: ITEM_H,
            borderColor: accent + "60",
            backgroundColor: accent + "12",
          },
        ]}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScrollBeginDrag={handleScrollBegin}
        onMomentumScrollEnd={handleMomentumEnd}
        contentContainerStyle={{ paddingVertical: ITEM_H * paddingItems }}
      >
        {items.map((item, i) => {
          const active = i === selectedIndex;
          return (
            <TouchableOpacity
              key={item}
              style={wc.item}
              onPress={() => {
                scrollRef.current?.scrollTo({ y: i * ITEM_H, animated: true });
                onSelect(i);
              }}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  wc.itemText,
                  { color: active ? accent : colors.textSecondary },
                  active && wc.itemTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const wc = StyleSheet.create({
  highlight: {
    position: "absolute",
    left: 4,
    right: 4,
    borderRadius: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    zIndex: 1,
    pointerEvents: "none",
  } as any,
  item: {
    height: ITEM_H,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  itemText: {
    fontSize: 18,
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.2,
  },
  itemTextActive: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
  },
});

// ── Time picker sheet ─────────────────────────────────────────────────────────

const HOURS   = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));
const PERIODS = ["AM", "PM"];

interface TimePickerSheetProps {
  visible: boolean;
  label: string;
  value: string; // "HH:MM" 24h
  onConfirm: (value: string) => void;
  onClose: () => void;
}

function TimePickerSheet({ visible, label, value, onConfirm, onClose }: TimePickerSheetProps) {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();

  const parsed = parse24(value);

  // Snap minutes to nearest 5
  const minuteIndex = Math.round(parsed.minute / 5) % 12;

  const [hourIdx,   setHourIdx]   = useState(parsed.hour12 - 1);
  const [minuteIdx, setMinuteIdx] = useState(minuteIndex);
  const [periodIdx, setPeriodIdx] = useState(parsed.period === "AM" ? 0 : 1);

  // Re-sync when value changes from outside
  useEffect(() => {
    if (!visible) return;
    const p = parse24(value);
    setHourIdx(p.hour12 - 1);
    setMinuteIdx(Math.round(p.minute / 5) % 12);
    setPeriodIdx(p.period === "AM" ? 0 : 1);
  }, [visible, value]);

  function handleConfirm() {
    const h12     = hourIdx + 1;
    const minute  = parseInt(MINUTES[minuteIdx] ?? "00", 10);
    const period  = PERIODS[periodIdx] as "AM" | "PM";
    const result  = format24(h12, minute, period);
    onConfirm(result);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onClose();
  }

  const COLUMN_W = 64;

  const overlayStyle = SHEET_OVERLAY_STYLE;
  const animType = "slide" as const;

  return (
    <Modal visible={visible} transparent animationType={animType} onRequestClose={onClose}>
      <Pressable style={[overlayStyle, { backgroundColor: "rgba(0,0,0,0.5)" }]} onPress={onClose}>
        <Pressable onPress={() => {}}>
          <BottomSheetContainer backgroundColor={colors.surface}>
            <View style={[tps.inner, { paddingBottom: insets.bottom + 16 }]}>
              {/* Handle bar */}
              <View style={[tps.handle, { backgroundColor: colors.border }]} />

              <Text style={[tps.label, { color: colors.text }]}>{label}</Text>

              {/* Wheel columns */}
              <View style={tps.wheelsRow}>
                <WheelColumn
                  items={HOURS}
                  selectedIndex={hourIdx}
                  onSelect={setHourIdx}
                  colors={colors}
                  accent={accent}
                  width={COLUMN_W}
                />
                <Text style={[tps.colon, { color: colors.textMuted }]}>:</Text>
                <WheelColumn
                  items={MINUTES}
                  selectedIndex={minuteIdx}
                  onSelect={setMinuteIdx}
                  colors={colors}
                  accent={accent}
                  width={COLUMN_W}
                />
                <View style={tps.spacer} />
                <WheelColumn
                  items={PERIODS}
                  selectedIndex={periodIdx}
                  onSelect={setPeriodIdx}
                  colors={colors}
                  accent={accent}
                  width={COLUMN_W}
                />
              </View>

              {/* Confirm button */}
              <TouchableOpacity
                style={[tps.confirmBtn, { backgroundColor: accent }]}
                onPress={handleConfirm}
                activeOpacity={0.85}
              >
                <Text style={tps.confirmText}>Set Time</Text>
              </TouchableOpacity>
            </View>
          </BottomSheetContainer>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const tps = StyleSheet.create({
  inner:       { paddingTop: 12, paddingHorizontal: 20, gap: 16 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 4 },
  label:       { fontSize: 16, fontFamily: "Inter_700Bold", textAlign: "center" },
  wheelsRow:   { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
  colon:       { fontSize: 24, fontFamily: "Inter_700Bold", marginBottom: 2, width: 16, textAlign: "center" },
  spacer:      { width: 20 },
  confirmBtn:  { borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  confirmText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff" },
});

// ── Sound options ─────────────────────────────────────────────────────────────

const SOUND_OPTIONS: { value: SoundMode; icon: string; label: string; sub: string }[] = [
  { value: "device",  icon: "phone-portrait",  label: "Device Default",  sub: "Your system notification sound (recommended)" },
  { value: "afuchat", icon: "musical-notes",   label: "AfuChat Sound",   sub: "Branded in-app tune (active chats only)" },
  { value: "silent",  icon: "volume-mute",     label: "Silent",          sub: "Vibrate only — no sound" },
];

// ── Main screen ───────────────────────────────────────────────────────────────

export default function NotificationSettingsScreen() {
  const { colors, accent } = useTheme();
  const { user }   = useAuth();
  const insets     = useSafeAreaInsets();
  const { features: adv, setFeature } = useAdvancedFeatures();

  const [prefs, setPrefs]               = useState<Prefs>(defaults);
  const [soundMode, setSoundModeState]  = useState<SoundMode>("device");
  const [testingSound, setTestingSound] = useState(false);
  const [saving, setSaving]             = useState<string | null>(null);

  // Which time picker is open: "start" | "end" | null
  const [pickerOpen, setPickerOpen] = useState<"start" | "end" | null>(null);

  // Animated max-height for the quiet hours expanded section
  const expandAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: prefs.quiet_hours_enabled ? 1 : 0,
      duration: 260,
      useNativeDriver: false,
    }).start();
  }, [prefs.quiet_hours_enabled]);

  // Load prefs from DB
  useEffect(() => {
    if (!user) return;
    supabase
      .from("notification_preferences")
      .select(
        "user_id, push_enabled, push_messages, push_likes, push_follows, push_gifts, " +
        "push_mentions, push_replies, quiet_hours_enabled, quiet_hours_start, " +
        "quiet_hours_end, quiet_hours_timezone",
      )
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const prefsData = data as any;
        if (prefsData) {
          // Format TIME columns from "HH:MM:SS" to "HH:MM"
          const start = (prefsData.quiet_hours_start as string | null)?.slice(0, 5) ?? "22:00";
          const end   = (prefsData.quiet_hours_end   as string | null)?.slice(0, 5) ?? "08:00";
          setPrefs({
            ...defaults,
            ...prefsData,
            quiet_hours_start: start,
            quiet_hours_end:   end,
            quiet_hours_timezone: prefsData.quiet_hours_timezone ?? deviceTimezone(),
          });
        } else {
          // No row yet — seed with device timezone
          setPrefs((p) => ({ ...p, quiet_hours_timezone: deviceTimezone() }));
        }
      });
  }, [user]);

  // Load sound mode
  useEffect(() => { getSoundMode().then(setSoundModeState); }, []);

  async function toggle(key: keyof Prefs) {
    const val = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: val }));
    if (!user) return;
    const settingKey = NOTIF_KEY_MAP[key];
    if (settingKey) patchLocalSetting(user.id, settingKey as any, val as any).catch(() => {});
    await supabase
      .from("notification_preferences")
      .upsert({ user_id: user.id, [key]: val }, { onConflict: "user_id" });
    Haptics.selectionAsync();
  }

  async function saveTime(field: "quiet_hours_start" | "quiet_hours_end", value: string) {
    setSaving(field);
    setPrefs((p) => ({ ...p, [field]: value }));
    if (!user) { setSaving(null); return; }
    await supabase
      .from("notification_preferences")
      .upsert({ user_id: user.id, [field]: value }, { onConflict: "user_id" });
    setSaving(null);
    Haptics.selectionAsync();
  }

  async function saveTimezone(tz: string) {
    setPrefs((p) => ({ ...p, quiet_hours_timezone: tz }));
    if (!user) return;
    await supabase
      .from("notification_preferences")
      .upsert({ user_id: user.id, quiet_hours_timezone: tz }, { onConflict: "user_id" });
  }

  async function handleSoundModeChange(mode: SoundMode) {
    setSoundModeState(mode);
    await setSoundMode(mode);
    Haptics.selectionAsync();
  }

  async function testSound() {
    if (testingSound) return;
    setTestingSound(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await playNotificationSound();
    setTimeout(() => setTestingSound(false), 1200);
  }

  function PrefRow({
    label, field, sub,
  }: { label: string; field: keyof Prefs; sub?: string }) {
    return (
      <View style={[st.row, { borderBottomColor: colors.border }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[st.rowLabel, { color: colors.text }]}>{label}</Text>
          {sub && <Text style={[st.rowSub, { color: colors.textMuted }]}>{sub}</Text>}
        </View>
        <Switch
          value={prefs[field] as boolean}
          onValueChange={() => toggle(field)}
          trackColor={{ true: accent, false: colors.border }}
          thumbColor={(prefs[field] ? accent : colors.textMuted) as string}
        />
      </View>
    );
  }

  function TimeRow({
    label, field,
  }: { label: string; field: "quiet_hours_start" | "quiet_hours_end" }) {
    const isSaving = saving === field;
    return (
      <TouchableOpacity
        style={[st.row, { borderBottomColor: colors.border }]}
        onPress={() => setPickerOpen(field === "quiet_hours_start" ? "start" : "end")}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={[st.rowLabel, { color: colors.text }]}>{label}</Text>
        </View>
        {isSaving ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <View style={[st.timeBadge, { backgroundColor: accent + "15", borderColor: accent + "40" }]}>
            <Text style={[st.timeBadgeText, { color: accent }]}>
              {display12(prefs[field])}
            </Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={[st.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Notifications" />

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 32, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Notification Sound ───────────────────────────────────── */}
        <Text style={[st.section, { color: colors.textMuted }]}>NOTIFICATION SOUND</Text>
        <GlassCard style={{ marginHorizontal: 16, borderRadius: 20, overflow: "hidden" }} variant="medium">
          <View style={st.soundGrid}>
            {SOUND_OPTIONS.map((opt) => {
              const active = soundMode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  style={[
                    st.soundCard,
                    { borderColor: active ? accent : colors.border, backgroundColor: active ? accent + "12" : colors.surface },
                  ]}
                  onPress={() => handleSoundModeChange(opt.value)}
                  activeOpacity={0.8}
                >
                  <View style={[st.soundIconWrap, { backgroundColor: active ? accent + "20" : colors.backgroundSecondary }]}>
                    <Ionicons name={opt.icon as any} size={22} color={active ? accent : colors.textSecondary} />
                  </View>
                  <Text style={[st.soundCardLabel, { color: active ? accent : colors.text }]}>{opt.label}</Text>
                  <Text style={[st.soundCardSub, { color: colors.textMuted }]} numberOfLines={2}>{opt.sub}</Text>
                  {active && (
                    <View style={[st.soundCheckmark, { backgroundColor: accent }]}>
                      <Ionicons name="checkmark" size={11} color="#fff" />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </GlassCard>

        <GlassCard style={{ marginHorizontal: 16, borderRadius: 16, overflow: "hidden" }} variant="subtle" noShadow>
          <View style={st.soundActions}>
            <TouchableOpacity
              style={[st.testBtn, { backgroundColor: accent + "15", borderColor: accent + "50" }]}
              onPress={testSound}
              disabled={testingSound || soundMode === "silent"}
              activeOpacity={0.8}
            >
              {testingSound ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <Ionicons name="volume-high" size={16} color={soundMode === "silent" ? colors.textMuted : accent} />
              )}
              <Text style={[st.testBtnText, { color: soundMode === "silent" ? colors.textMuted : accent }]}>
                {testingSound ? "Playing…" : "Test Sound"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.sysSettingsBtn} onPress={() => Linking.openSettings()} activeOpacity={0.7}>
              <Ionicons name="settings" size={14} color={colors.textMuted} />
              <Text style={[st.sysSettingsText, { color: colors.textMuted }]}>
                Change push sound in system settings →
              </Text>
            </TouchableOpacity>
          </View>
        </GlassCard>

        {/* ── Push toggles ─────────────────────────────────────────── */}
        <Text style={[st.section, { color: colors.textMuted }]}>PUSH NOTIFICATIONS</Text>
        <GlassCard style={{ marginHorizontal: 16, borderRadius: 20, overflow: "hidden" }} variant="medium">
          <PrefRow label="Enable Push Notifications" field="push_enabled"  sub="Master toggle for all push alerts" />
          <PrefRow label="Messages"      field="push_messages" sub="Chat messages from your contacts" />
          <PrefRow label="Likes"         field="push_likes"    sub="When someone likes your post" />
          <PrefRow label="New Followers" field="push_follows"  sub="When someone starts following you" />
          <PrefRow label="Gifts"         field="push_gifts"    sub="When someone sends you a gift" />
          <PrefRow label="Mentions"      field="push_mentions" sub="When you're mentioned in a post" />
          <PrefRow label="Replies"       field="push_replies"  sub="When someone replies to your post" />
        </GlassCard>

        {/* ── Focus & Smart Alerts ─────────────────────────────────── */}
        <Text style={[st.section, { color: colors.textMuted }]}>FOCUS & SMART ALERTS</Text>
        <GlassCard style={{ marginHorizontal: 16, borderRadius: 20, overflow: "hidden" }} variant="medium">
          <View style={[st.row, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[st.rowLabel, { color: colors.text }]}>Smart Notifications</Text>
              <Text style={[st.rowSub, { color: colors.textMuted }]}>Intelligent filtering to surface only important alerts</Text>
            </View>
            <Switch value={adv.smart_notifications} onValueChange={(v) => setFeature("smart_notifications", v)}
              trackColor={{ true: accent, false: colors.border }} thumbColor="#fff" />
          </View>
          <View style={[st.row, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[st.rowLabel, { color: colors.text }]}>Focus Mode</Text>
              <Text style={[st.rowSub, { color: colors.textMuted }]}>Pause all non-urgent notifications and appear offline</Text>
            </View>
            <Switch value={adv.focus_mode} onValueChange={(v) => setFeature("focus_mode", v)}
              trackColor={{ true: accent, false: colors.border }} thumbColor="#fff" />
          </View>
          <View style={[st.row, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[st.rowLabel, { color: colors.text }]}>Message Reminders</Text>
              <Text style={[st.rowSub, { color: colors.textMuted }]}>Set a reminder to reply to any message later</Text>
            </View>
            <Switch value={adv.message_reminders} onValueChange={(v) => setFeature("message_reminders", v)}
              trackColor={{ true: accent, false: colors.border }} thumbColor="#fff" />
          </View>
          <View style={[st.row, { borderBottomColor: colors.border }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[st.rowLabel, { color: colors.text }]}>Keyword Alerts</Text>
              <Text style={[st.rowSub, { color: colors.textMuted }]}>Get notified when specific words appear in a chat</Text>
            </View>
            <Switch value={adv.keyword_alerts} onValueChange={(v) => setFeature("keyword_alerts", v)}
              trackColor={{ true: accent, false: colors.border }} thumbColor="#fff" />
          </View>
        </GlassCard>

        {/* ── Quiet hours ──────────────────────────────────────────── */}
        <Text style={[st.section, { color: colors.textMuted }]}>QUIET HOURS</Text>
        <GlassCard style={{ marginHorizontal: 16, borderRadius: 20, overflow: "hidden" }} variant="medium">

          {/* Master toggle */}
          <View style={st.row}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[st.rowLabel, { color: colors.text }]}>Enable Quiet Hours</Text>
              <Text style={[st.rowSub, { color: colors.textMuted }]}>
                Silence non-urgent notifications during a set window
              </Text>
            </View>
            <Switch
              value={prefs.quiet_hours_enabled}
              onValueChange={() => toggle("quiet_hours_enabled")}
              trackColor={{ true: accent, false: colors.border }}
              thumbColor={prefs.quiet_hours_enabled ? accent : colors.textMuted}
            />
          </View>

          {/* Expanded section — animated */}
          <Animated.View
            style={{
              maxHeight: expandAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 300] }),
              overflow: "hidden",
              opacity: expandAnim,
            }}
          >
            <TimeRow label="Start (do not disturb from)" field="quiet_hours_start" />
            <TimeRow label="End (resume notifications at)" field="quiet_hours_end" />

            {/* Timezone row */}
            <View style={[st.row, { borderBottomColor: "transparent" }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[st.rowLabel, { color: colors.text }]}>Timezone</Text>
                <Text style={[st.rowSub, { color: colors.textMuted }]}>
                  {prefs.quiet_hours_timezone}
                </Text>
              </View>
              <TouchableOpacity
                style={[st.tzBadge, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}
                onPress={() => {
                  const tz = deviceTimezone();
                  saveTimezone(tz);
                  Haptics.selectionAsync();
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="locate" size={13} color={colors.textSecondary} />
                <Text style={[st.tzBadgeText, { color: colors.textSecondary }]}>
                  {shortTz(prefs.quiet_hours_timezone)}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Info pill */}
            <View style={[st.quietInfo, { backgroundColor: accent + "10", marginHorizontal: 16, marginBottom: 12 }]}>
              <Ionicons name="call" size={14} color={accent} />
              <Text style={[st.quietInfoText, { color: accent }]}>
                Incoming calls always come through — quiet hours only silence messages & social alerts.
              </Text>
            </View>
          </Animated.View>
        </GlassCard>

        {/* ── Quick actions info ───────────────────────────────────── */}
        <Text style={[st.section, { color: colors.textMuted }]}>QUICK ACTIONS</Text>
        <GlassCard style={{ marginHorizontal: 16, borderRadius: 20, overflow: "hidden", padding: 14 }} variant="subtle" noShadow>
          <View style={[st.infoCard, { borderColor: accent + "30" }]}>
            <View style={[st.infoIconWrap, { backgroundColor: accent + "15" }]}>
              <Ionicons name="flash" size={20} color={accent} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[st.infoTitle, { color: colors.text }]}>Reply without opening AfuChat</Text>
              <Text style={[st.infoBody, { color: colors.textSecondary }]}>
                Notifications include action buttons so you can reply to messages, like posts, follow back, or snooze reminders — all directly from your lock screen or status bar.
              </Text>
              <View style={st.actionTagsRow}>
                {["💬 Reply", "❤️ Like", "➕ Follow", "🔕 Snooze"].map((tag) => (
                  <View key={tag} style={[st.actionTag, { backgroundColor: accent + "15" }]}>
                    <Text style={[st.actionTagText, { color: accent }]}>{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </GlassCard>
      </ScrollView>

      {/* ── Time picker modals ─────────────────────────────────────── */}
      <TimePickerSheet
        visible={pickerOpen === "start"}
        label="Do not disturb from…"
        value={prefs.quiet_hours_start}
        onConfirm={(v) => saveTime("quiet_hours_start", v)}
        onClose={() => setPickerOpen(null)}
      />
      <TimePickerSheet
        visible={pickerOpen === "end"}
        label="Resume notifications at…"
        value={prefs.quiet_hours_end}
        onConfirm={(v) => saveTime("quiet_hours_end", v)}
        onClose={() => setPickerOpen(null)}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  root: { flex: 1 },

  section: {
    fontSize: 12, fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8,
    textTransform: "uppercase", letterSpacing: 0.6,
  },

  soundGrid: {
    flexDirection: "row", flexWrap: "wrap",
    paddingHorizontal: 12, paddingVertical: 12, gap: 10,
  },
  soundCard: {
    flex: 1, minWidth: "28%",
    borderRadius: 14, borderWidth: 1.5,
    padding: 12, gap: 6, alignItems: "flex-start",
  },
  soundIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  soundCardLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  soundCardSub:   { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15 },
  soundCheckmark: {
    position: "absolute", top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  soundActions:  { padding: 14, gap: 12 },
  testBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 10, paddingVertical: 11, borderWidth: 1,
  },
  testBtnText:    { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sysSettingsBtn: { flexDirection: "row", alignItems: "center", gap: 6, justifyContent: "center" },
  sysSettingsText:{ fontSize: 12, fontFamily: "Inter_400Regular" },

  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  rowLabel: { fontSize: 15, fontFamily: "Inter_500Medium" },
  rowSub:   { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  timeBadge: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 8, borderWidth: 1,
  },
  timeBadgeText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },

  tzBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, borderWidth: 0.5,
  },
  tzBadgeText: { fontSize: 12, fontFamily: "Inter_500Medium" },

  quietInfo: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: 10, borderRadius: 10,
  },
  quietInfoText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  infoCard: { padding: 14, flexDirection: "row", gap: 12, alignItems: "flex-start" },
  infoIconWrap: {
    width: 38, height: 38, borderRadius: 10,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  infoTitle:  { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  infoBody:   { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  actionTagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  actionTag:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  actionTagText: { fontSize: 12, fontFamily: "Inter_500Medium" },
});
