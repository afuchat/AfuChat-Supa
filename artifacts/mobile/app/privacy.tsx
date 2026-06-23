import React, { useEffect } from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/hooks/useTheme";

const EFFECTIVE_DATE = "1 January 2025";
const COMPANY = "AfuChat Technologies Limited";
const CONTACT_EMAIL = "privacy@afuchat.com";

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS !== "web") {
      Linking.openURL("https://afuchat.com/privacy").catch(() => {});
      if (router.canGoBack()) router.back();
    }
  }, []);

  if (Platform.OS !== "web") return null;

  return <PrivacyContent insets={insets} />;
}

function PrivacyContent({ insets }: { insets: any }) {
  const { colors } = useTheme();

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/" as any)} style={s.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Privacy Policy</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[s.updated, { color: colors.textMuted }]}>Effective {EFFECTIVE_DATE}</Text>

        <Text style={[s.intro, { color: colors.textSecondary }]}>
          At AfuChat, your privacy is important to us. This Privacy Policy explains what data we collect, how we use it, and the choices you have. By using AfuChat, you agree to this policy.
        </Text>

        <Section title="1. Information We Collect" color={colors.text} mutedColor={colors.textSecondary}>
          <B>Account Information</B>{"\n"}
          When you create an account, we collect your email address, chosen username (handle), display name, date of birth (age verification), and profile photo.{"\n\n"}
          <B>Content & Activity</B>{"\n"}
          We store messages, posts, stories, videos, comments, reactions, and other content you create. We also log your in-app interactions such as follows, likes, and search queries.{"\n\n"}
          <B>Device & Technical Data</B>{"\n"}
          We collect device type, operating system, app version, IP address, and crash reports to maintain service quality.{"\n\n"}
          <B>Location Data</B>{"\n"}
          With your permission, we may collect approximate location data (country/region) to personalise your experience. We never collect precise GPS coordinates without explicit consent.{"\n\n"}
          <B>Payment & Wallet Data</B>{"\n"}
          Virtual currency (ACoin and Nexa) transactions are stored server-side. Real-money top-ups are processed by Pesapal — we do not store raw card or bank details.
        </Section>

        <Section title="2. How We Use Your Information" color={colors.text} mutedColor={colors.textSecondary}>
          We use your information to:{"\n"}
          • Provide and improve our services{"\n"}
          • Personalise your experience and content feed{"\n"}
          • Process transactions and manage subscriptions{"\n"}
          • Send you notifications about activity on your account{"\n"}
          • Detect and prevent fraud, abuse, and security incidents{"\n"}
          • Comply with legal obligations{"\n"}
          • Communicate service updates and policy changes
        </Section>

        <Section title="3. Messaging Privacy" color={colors.text} mutedColor={colors.textSecondary}>
          Direct messages between users are stored in encrypted form in our database. Secret Chats use end-to-end encryption where messages are not readable by AfuChat servers. Regular chats use server-side encryption at rest.{"\n\n"}
          We do not sell or share your message content with third parties for advertising. Messages may be reviewed by our safety team only when a report is filed and investigation is required.
        </Section>

        <Section title="4. AfuAI & AI Features" color={colors.text} mutedColor={colors.textSecondary}>
          Conversations with AfuAI are stored locally on your device (for context) and briefly processed by our AI infrastructure (Supabase Edge Functions using Groq/OpenAI). We do not use your AfuAI conversations to train public AI models.{"\n\n"}
          You can clear your AfuAI conversation history at any time from the AfuAI chat screen.
        </Section>

        <Section title="5. Data Sharing" color={colors.text} mutedColor={colors.textSecondary}>
          We do not sell your personal data. We may share data with:{"\n\n"}
          <B>Service Providers</B> — Supabase (infrastructure), Cloudflare R2 (media storage), Pesapal (payments), and email delivery providers — solely to operate our services.{"\n\n"}
          <B>Legal Requirements</B> — When required by law, court order, or to protect the rights and safety of users and the public.{"\n\n"}
          <B>Business Transfers</B> — In connection with a merger or acquisition, with appropriate data protection obligations.
        </Section>

        <Section title="6. Data Retention" color={colors.text} mutedColor={colors.textSecondary}>
          We retain your data for as long as your account is active. When you delete your account, we permanently remove your profile, messages, posts, and associated data within 30 days, except where retention is required by law.{"\n\n"}
          Some anonymised, aggregated data may be retained for analytics purposes after account deletion.
        </Section>

        <Section title="7. Your Rights & Controls" color={colors.text} mutedColor={colors.textSecondary}>
          Depending on your location, you may have the right to:{"\n"}
          • Access the personal data we hold about you{"\n"}
          • Correct inaccurate data{"\n"}
          • Request deletion of your data (Settings › Account › Delete Account){"\n"}
          • Download a copy of your data (Settings › Privacy › Data Export){"\n"}
          • Opt out of non-essential data processing{"\n\n"}
          To exercise these rights, contact {CONTACT_EMAIL}.
        </Section>

        <Section title="8. Cookies & Tracking (Web)" color={colors.text} mutedColor={colors.textSecondary}>
          Our web app uses essential cookies for authentication and session management. We do not use third-party advertising cookies. Analytics are collected in aggregate form only. You can clear cookies via your browser settings.
        </Section>

        <Section title="9. Children's Privacy" color={colors.text} mutedColor={colors.textSecondary}>
          AfuChat requires users to be at least 13 years old. We do not knowingly collect personal information from children under 13. If we become aware of such collection, we will promptly delete the data and close the account. Contact {CONTACT_EMAIL} if you believe a child has registered.
        </Section>

        <Section title="10. Security" color={colors.text} mutedColor={colors.textSecondary}>
          We implement industry-standard technical and organisational measures to protect your data, including encryption at rest and in transit, access controls, and regular security reviews. No system is 100% secure — use a strong, unique password and enable two-factor authentication.
        </Section>

        <Section title="11. International Transfers" color={colors.text} mutedColor={colors.textSecondary}>
          AfuChat is operated from Uganda. Your data may be processed in countries where our infrastructure providers (Supabase, Cloudflare) operate. We ensure appropriate safeguards are in place for cross-border data transfers.
        </Section>

        <Section title="12. Changes to This Policy" color={colors.text} mutedColor={colors.textSecondary}>
          We may update this Privacy Policy from time to time. We will notify you of material changes via in-app notification or email at least 14 days before they take effect. Continued use of AfuChat after the effective date constitutes acceptance of the updated policy.
        </Section>

        <Section title="13. Contact Us" color={colors.text} mutedColor={colors.textSecondary}>
          For any privacy questions or requests:{"\n\n"}
          {COMPANY}{"\n"}
          Email: {CONTACT_EMAIL}{"\n"}
          Website: https://afuchat.com/privacy
        </Section>

        <View style={s.footerLinks}>
          <TouchableOpacity onPress={() => router.push("/terms" as any)}>
            <Text style={[s.footerLink, { color: "#1f95ff" }]}>View Terms of Service →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function Section({ title, children, color, mutedColor }: { title: string; children: React.ReactNode; color: string; mutedColor: string }) {
  return (
    <View style={s.section}>
      <Text style={[s.sectionTitle, { color }]}>{title}</Text>
      <Text style={[s.sectionBody, { color: mutedColor }]}>{children as any}</Text>
    </View>
  );
}

function B({ children }: { children: string }) {
  return <Text style={{ fontWeight: "700" }}>{children}</Text>;
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  backBtn: { width: 36, alignItems: "flex-start" },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  content: { paddingHorizontal: 20, paddingTop: 24, maxWidth: 720, alignSelf: "center", width: "100%" as any },
  updated: { fontSize: 12, marginBottom: 16, fontStyle: "italic" },
  intro: { fontSize: 15, lineHeight: 24, marginBottom: 24, fontWeight: "500" },
  section: { marginBottom: 28 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  sectionBody: { fontSize: 14, lineHeight: 22 },
  footerLinks: { marginTop: 16, alignItems: "flex-start" },
  footerLink: { fontSize: 14, fontWeight: "600" },
});
