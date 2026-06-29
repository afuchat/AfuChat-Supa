import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "@/lib/haptics";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { useTheme } from "@/hooks/useTheme";
import { showAlert } from "@/lib/alert";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { Avatar } from "@/components/ui/Avatar";
import { AfuLogo } from "@/components/ui/AfuLogo";
import Colors from "@/constants/colors";

// ─── Theme toggle options ──────────────────────────────────────────────────────
const THEME_OPTIONS = [
  { key: "light"  as const, label: "Light",  icon: "sunny-outline"          as const },
  { key: "system" as const, label: "Auto",   icon: "contrast-outline"       as const },
  { key: "dark"   as const, label: "Dark",   icon: "moon-outline"           as const },
];

// ─── Reusable row primitives ───────────────────────────────────────────────────
function Section({
  title,
  children,
  colors,
}: {
  title?: string;
  children: React.ReactNode;
  colors: ReturnType<typeof useTheme>["colors"];
}) {
  return (
    <View style={s.section}>
      {title && (
        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>{title}</Text>
      )}
      <View style={[s.card, { backgroundColor: colors.card }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  iconColor,
  iconBg,
  label,
  sublabel,
  value,
  badge,
  onPress,
  last,
  colors,
  accent,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconColor?: string;
  iconBg?: string;
  label: string;
  sublabel?: string;
  value?: string;
  badge?: string;
  onPress?: () => void;
  last?: boolean;
  colors: ReturnType<typeof useTheme>["colors"];
  accent: string;
}) {
  const ic = iconColor ?? accent;
  const bg = iconBg ?? ic + "18";
  return (
    <>
      <TouchableOpacity
        style={s.row}
        onPress={onPress}
        activeOpacity={onPress ? 0.7 : 1}
        disabled={!onPress}
      >
        <View style={[s.iconWrap, { backgroundColor: bg }]}>
          <Ionicons name={icon} size={18} color={ic} />
        </View>
        <View style={s.rowText}>
          <Text style={[s.rowLabel, { color: colors.text }]}>{label}</Text>
          {sublabel && (
            <Text style={[s.rowSub, { color: colors.textMuted }]} numberOfLines={1}>
              {sublabel}
            </Text>
          )}
        </View>
        {value && (
          <Text style={[s.rowValue, { color: colors.textMuted }]}>{value}</Text>
        )}
        {badge && (
          <View style={[s.badge, { backgroundColor: accent + "22" }]}>
            <Text style={[s.badgeText, { color: accent }]}>{badge}</Text>
          </View>
        )}
        {onPress && (
          <Ionicons name="chevron-forward" size={15} color={colors.textMuted} style={{ marginLeft: 2 }} />
        )}
      </TouchableOpacity>
      {!last && <View style={[s.divider, { backgroundColor: colors.separator }]} />}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const { colors, themeMode, setThemeMode, accent, isDark } = useTheme();
  const { langLabel } = useLanguage();
  const { user, profile, isPremium, linkedAccounts, switchAccount } = useAuth();
  const insets = useSafeAreaInsets();
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const activeAccount = linkedAccounts.find((a) => a.userId === user?.id);
  const otherAccounts = linkedAccounts.filter((a) => a.userId !== user?.id);
  const displayAccounts =
    linkedAccounts.length === 0 && user && profile
      ? [{ userId: user.id, displayName: profile.display_name, handle: profile.handle, avatarUrl: profile.avatar_url, email: user.email || "", accessToken: "", refreshToken: "" }]
      : activeAccount
      ? [activeAccount, ...otherAccounts]
      : linkedAccounts;

  async function handleSwitch(userId: string) {
    if (userId === user?.id || switchingId) return;
    showAlert(
      "Switch account?",
      "Your current session will be saved.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          onPress: async () => {
            setSwitchingId(userId);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const result = await switchAccount(userId);
            setSwitchingId(null);
            if (!result.success) {
              showAlert("Switch Failed", result.error || "Could not switch account.");
            }
          },
        },
      ]
    );
  }

  const BRAND = Colors.brand;

  return (
    <View style={[s.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader title="Settings" />

      {/* Switching overlay */}
      {switchingId && (
        <View style={s.overlay}>
          <View style={[s.overlayCard, { backgroundColor: colors.surface }]}>
            <ActivityIndicator size="large" color={accent} />
            <Text style={[s.overlayTitle, { color: colors.text }]}>Switching account…</Text>
            <Text style={[s.overlaySub, { color: colors.textMuted }]}>Loading your other account</Text>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
        style={{ pointerEvents: switchingId ? "none" : "auto" }}
      >

        {/* ── Profile card ──────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[s.profileCard, { backgroundColor: colors.card }]}
          onPress={() => router.push("/profile/edit")}
          activeOpacity={0.8}
        >
          <Avatar
            uri={profile?.avatar_url}
            name={profile?.display_name}
            size={58}
          />
          <View style={s.profileInfo}>
            <View style={s.profileNameRow}>
              <Text style={[s.profileName, { color: colors.text }]} numberOfLines={1}>
                {profile?.display_name ?? "Your Name"}
              </Text>
              {isPremium && (
                <View style={[s.premiumPill, { backgroundColor: BRAND + "20" }]}>
                  <Ionicons name="star" size={10} color={BRAND} />
                  <Text style={[s.premiumText, { color: BRAND }]}>Premium</Text>
                </View>
              )}
            </View>
            <Text style={[s.profileHandle, { color: colors.textMuted }]} numberOfLines={1}>
              @{profile?.handle ?? "handle"}
            </Text>
            {user?.email && (
              <Text style={[s.profileEmail, { color: colors.textMuted }]} numberOfLines={1}>
                {user.email}
              </Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* ── Accounts ──────────────────────────────────────────────────── */}
        {displayAccounts.length > 1 && (
          <Section title="ACCOUNTS" colors={colors}>
            {displayAccounts.map((account, i) => {
              const isCurrent = account.userId === user?.id;
              const isSwitching = switchingId === account.userId;
              return (
                <React.Fragment key={account.userId}>
                  <Pressable
                    style={({ pressed }) => [
                      s.accountRow,
                      pressed && !isCurrent && !switchingId && { backgroundColor: colors.backgroundSecondary },
                    ]}
                    onPress={() => !isCurrent && !switchingId && handleSwitch(account.userId)}
                    disabled={isCurrent || !!switchingId}
                  >
                    <View style={s.accountAvatarWrap}>
                      <Avatar uri={account.avatarUrl} name={account.displayName} size={42} />
                      {isCurrent && (
                        <View style={[s.activeDot, { backgroundColor: accent, borderColor: colors.card }]}>
                          <Ionicons name="checkmark" size={8} color="#fff" />
                        </View>
                      )}
                    </View>
                    <View style={s.accountInfo}>
                      <Text style={[s.accountName, { color: colors.text }]} numberOfLines={1}>
                        {account.displayName}
                      </Text>
                      <Text style={[s.accountHandle, { color: colors.textMuted }]} numberOfLines={1}>
                        @{account.handle}
                      </Text>
                    </View>
                    {isSwitching ? (
                      <ActivityIndicator size="small" color={accent} />
                    ) : isCurrent ? (
                      <View style={[s.activePill, { backgroundColor: accent + "20" }]}>
                        <Text style={[s.activePillText, { color: accent }]}>Active</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[s.switchBtn, { backgroundColor: accent }]}
                        onPress={() => handleSwitch(account.userId)}
                        disabled={!!switchingId}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="swap-horizontal" size={12} color="#fff" />
                        <Text style={s.switchBtnText}>Switch</Text>
                      </TouchableOpacity>
                    )}
                  </Pressable>
                  {i < displayAccounts.length - 1 && (
                    <View style={[s.divider, { backgroundColor: colors.separator }]} />
                  )}
                </React.Fragment>
              );
            })}
            <View style={[s.divider, { backgroundColor: colors.separator }]} />
            <TouchableOpacity
              style={s.manageAccRow}
              onPress={() => router.push("/linked-accounts")}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={15} color={colors.textMuted} />
              <Text style={[s.manageAccText, { color: colors.textMuted }]}>
                {otherAccounts.length > 0 ? "Manage accounts" : "Add another account"}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={colors.textMuted} />
            </TouchableOpacity>
          </Section>
        )}

        {/* Show Manage Accounts link if only one account */}
        {displayAccounts.length <= 1 && (
          <Section colors={colors}>
            <Row
              icon="person-add-outline"
              label="Add Another Account"
              sublabel="Switch between multiple AfuChat accounts"
              onPress={() => router.push("/linked-accounts")}
              last
              colors={colors}
              accent={accent}
            />
          </Section>
        )}

        {/* ── Appearance ────────────────────────────────────────────────── */}
        <Section title="APPEARANCE" colors={colors}>
          <View style={s.themeRow}>
            {THEME_OPTIONS.map(({ key, label, icon }) => {
              const active = themeMode === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    s.themeBtn,
                    {
                      backgroundColor: active ? accent : colors.backgroundSecondary,
                      borderColor: active ? accent : colors.border,
                    },
                  ]}
                  onPress={() => { Haptics.selectionAsync(); setThemeMode(key); }}
                  activeOpacity={0.75}
                >
                  <Ionicons name={icon} size={16} color={active ? "#fff" : colors.textMuted} />
                  <Text style={[s.themeBtnText, { color: active ? "#fff" : colors.textMuted }]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[s.divider, { backgroundColor: colors.separator }]} />
          <Row
            icon="language-outline"
            label="Language"
            value={langLabel}
            onPress={() => router.push("/language-settings")}
            last
            colors={colors}
            accent={accent}
          />
        </Section>

        {/* ── Notifications ─────────────────────────────────────────────── */}
        {Platform.OS !== "web" && (
          <Section title="NOTIFICATIONS" colors={colors}>
            <Row
              icon="notifications-outline"
              label="Notifications"
              sublabel="Alerts, sounds and vibration"
              onPress={() => router.push("/settings/notifications")}
              last
              colors={colors}
              accent={accent}
            />
          </Section>
        )}

        {/* ── Messaging ─────────────────────────────────────────────────── */}
        <Section title="MESSAGING" colors={colors}>
          <Row
            icon="chatbubble-ellipses-outline"
            label="Chat Settings"
            sublabel="Bubbles, themes, media quality"
            onPress={() => router.push("/settings/chat")}
            colors={colors}
            accent={accent}
          />
          <Row
            icon="person-remove-outline"
            label="Blocked Users"
            sublabel="Manage people you've blocked"
            onPress={() => router.push("/settings/blocked")}
            last
            colors={colors}
            accent={accent}
          />
        </Section>

        {/* ── Privacy & Security ────────────────────────────────────────── */}
        <Section title="PRIVACY & SECURITY" colors={colors}>
          <Row
            icon="eye-off-outline"
            label="Privacy"
            sublabel="Visibility, messages, interactions"
            onPress={() => router.push("/settings/privacy")}
            colors={colors}
            accent={accent}
          />
          <Row
            icon="lock-closed-outline"
            label="Security & Password"
            sublabel="Password, 2FA, device lock"
            onPress={() => router.push("/settings/security")}
            colors={colors}
            accent={accent}
          />
          <Row
            icon="key-outline"
            label="Login Methods"
            sublabel="Google, Apple and other sign-in options"
            onPress={() => router.push("/settings/oauth-providers")}
            colors={colors}
            accent={accent}
          />
          <Row
            icon="cloud-download-outline"
            label="Download My Data"
            sublabel="Export a copy of your account data"
            onPress={() => router.push("/settings/privacy-download" as any)}
            last
            colors={colors}
            accent={accent}
          />
        </Section>

        {/* ── Storage & Data ────────────────────────────────────────────── */}
        <Section title="STORAGE & DATA" colors={colors}>
          <Row
            icon="server-outline"
            label="Storage & Cache"
            sublabel="Manage local files and cached media"
            onPress={() => router.push("/settings/storage")}
            colors={colors}
            accent={accent}
          />
          {Platform.OS !== "web" && (
            <Row
              icon="download-outline"
              label="Offline Videos"
              sublabel="Videos saved for offline playback"
              onPress={() => router.push("/settings/offline-videos" as any)}
              colors={colors}
              accent={accent}
            />
          )}
          {Platform.OS !== "web" && (
            <Row
              icon="eye-off-outline"
              label="Not Interested"
              sublabel="Muted authors and suppressed topics"
              onPress={() => router.push("/settings/not-interested" as any)}
              last
              colors={colors}
              accent={accent}
            />
          )}
        </Section>

        {/* ── Support & About ───────────────────────────────────────────── */}
        <Section title="SUPPORT & ABOUT" colors={colors}>
          <Row
            icon="help-buoy-outline"
            label="Help & Support"
            sublabel="FAQs, contact and tickets"
            onPress={() => router.push("/support" as any)}
            colors={colors}
            accent={accent}
          />
          <Row
            icon="information-circle-outline"
            label="About AfuChat"
            sublabel="Version, terms, privacy and company info"
            onPress={() => router.push("/about" as any)}
            last
            colors={colors}
            accent={accent}
          />
        </Section>

        {/* ── Brand footer ──────────────────────────────────────────────── */}
        <View style={s.footer}>
          <View style={s.footerBrand}>
            <AfuLogo size={24} />
            <Text style={[s.footerAfu,  { color: colors.textMuted }]}>Afu</Text>
            <Text style={[s.footerChat, { color: BRAND }]}>Chat</Text>
          </View>
          <Text style={[s.footerTagline, { color: colors.textMuted }]}>
            Connect · Discover · Create
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 12, gap: 0 },

  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", zIndex: 100 },
  overlayCard: {
    borderRadius: 24, padding: 32, alignItems: "center", gap: 14, minWidth: 240,
    ...Platform.select({
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.2)" } as any,
      default: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 24, elevation: 12 },
    }),
  },
  overlayTitle: { fontSize: 17, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  overlaySub:   { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 18 },

  // Profile card
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 16,
    gap: 14,
    marginBottom: 20,
  },
  profileInfo: { flex: 1, gap: 2 },
  profileNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  profileName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  premiumPill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  premiumText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  profileHandle: { fontSize: 13, fontFamily: "Inter_400Regular" },
  profileEmail:  { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },

  // Section container
  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6, marginBottom: 8, paddingHorizontal: 4 },
  card: { borderRadius: 18, overflow: "hidden" },

  // Generic row
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 13, gap: 12 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontFamily: "Inter_400Regular" },
  rowSub:   { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  rowValue: { fontSize: 13, fontFamily: "Inter_400Regular" },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  divider: { height: 0.5, marginHorizontal: 16 },

  // Theme toggle
  themeRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  themeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
  },
  themeBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },

  // Account rows
  accountRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 12 },
  accountAvatarWrap: { position: "relative" },
  activeDot: { position: "absolute", bottom: -1, right: -1, width: 15, height: 15, borderRadius: 8, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  accountInfo: { flex: 1 },
  accountName:   { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  accountHandle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  activePill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3 },
  activePillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  switchBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 16 },
  switchBtnText: { color: "#fff", fontSize: 12, fontFamily: "Inter_600SemiBold" },
  manageAccRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 11 },
  manageAccText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },

  // Footer
  footer: { alignItems: "center", paddingTop: 16, paddingBottom: 8, gap: 4 },
  footerBrand: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerAfu:  { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  footerChat: { fontSize: 18, fontFamily: "Inter_700Bold", letterSpacing: -0.4 },
  footerTagline: { fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 0.3 },
});
