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
const CONTACT_EMAIL = "legal@afuchat.com";

export default function TermsScreen() {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS !== "web") {
      Linking.openURL("https://afuchat.com/terms").catch(() => {});
      if (router.canGoBack()) router.back();
    }
  }, []);

  if (Platform.OS !== "web") return null;

  return <TermsContent insets={insets} />;
}

function TermsContent({ insets }: { insets: any }) {
  const { colors } = useTheme();

  return (
    <View style={[s.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace("/" as any)} style={s.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>Terms of Service</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[s.updated, { color: colors.textMuted }]}>Effective {EFFECTIVE_DATE}</Text>

        <Text style={[s.intro, { color: colors.textSecondary }]}>
          Welcome to AfuChat. By accessing or using our platform, you agree to be bound by these Terms of Service. Please read them carefully before using our services.
        </Text>

        <Section title="1. Acceptance of Terms" color={colors.text} mutedColor={colors.textSecondary}>
          By creating an account or using AfuChat services, you agree to these Terms and our Privacy Policy. If you do not agree, do not use AfuChat. These terms constitute a legally binding agreement between you and {COMPANY}.
        </Section>

        <Section title="2. Eligibility" color={colors.text} mutedColor={colors.textSecondary}>
          You must be at least 13 years old to use AfuChat. By using our services, you represent and warrant that you meet this requirement. If you are under 18, you confirm that you have obtained parental or guardian consent.
        </Section>

        <Section title="3. Your Account" color={colors.text} mutedColor={colors.textSecondary}>
          You are responsible for maintaining the security of your account credentials. You must not share your password or allow others to access your account. You are responsible for all activity that occurs under your account. Notify us immediately at {CONTACT_EMAIL} if you suspect unauthorised access.{"\n\n"}
          Each person may hold only one account. Creating duplicate accounts or impersonating other users is prohibited and may result in permanent suspension.
        </Section>

        <Section title="4. User Content" color={colors.text} mutedColor={colors.textSecondary}>
          You retain ownership of content you post on AfuChat. By posting, you grant AfuChat a worldwide, non-exclusive, royalty-free licence to use, display, distribute, and promote your content within the platform.{"\n\n"}
          You are solely responsible for content you share. You must not post content that is unlawful, harmful, threatening, abusive, harassing, defamatory, pornographic, or that infringes on intellectual property rights.
        </Section>

        <Section title="5. Prohibited Conduct" color={colors.text} mutedColor={colors.textSecondary}>
          You agree not to:{"\n"}
          • Violate any applicable law or regulation{"\n"}
          • Impersonate any person or entity{"\n"}
          • Engage in spam, phishing, or deceptive practices{"\n"}
          • Use automated tools to scrape or harvest data{"\n"}
          • Attempt to gain unauthorised access to our systems{"\n"}
          • Distribute malware, viruses, or harmful code{"\n"}
          • Harass, bully, or threaten other users{"\n"}
          • Engage in fraudulent transactions using AfuCoins or Nexa
        </Section>

        <Section title="6. Virtual Currency — ACoins & Nexa" color={colors.text} mutedColor={colors.textSecondary}>
          AfuChat operates two virtual currencies: ACoins (AC) and Nexa (XP). These have no real-world monetary value outside the AfuChat ecosystem.{"\n\n"}
          ACoins may be purchased and used to subscribe to premium plans, send gifts, and access features. Nexa (XP) is earned through activity and rewarded for engagement.{"\n\n"}
          Virtual currency balances are non-refundable except where required by applicable law. We reserve the right to modify exchange rates, conversion rules, and feature pricing with reasonable notice.
        </Section>

        <Section title="7. Premium Subscriptions" color={colors.text} mutedColor={colors.textSecondary}>
          AfuChat offers three premium tiers — Silver, Gold, and Platinum — payable in ACoins. Subscriptions are activated for 30-day periods. Benefits are detailed on the Premium page.{"\n\n"}
          Subscriptions auto-expire at the end of the billing period unless renewed. You may cancel at any time; cancellation takes effect at the end of the current period. Refunds are not issued for unused subscription days, except where required by law.
        </Section>

        <Section title="8. AfuAI Services" color={colors.text} mutedColor={colors.textSecondary}>
          AfuAI is provided as an assistive tool. AI-generated responses are not professional advice — they should not be relied upon for medical, legal, financial, or other critical decisions.{"\n\n"}
          Message limits apply based on your subscription tier. Free users receive a limited number of daily AI interactions. AfuAI may not always be available or accurate.
        </Section>

        <Section title="9. Intellectual Property" color={colors.text} mutedColor={colors.textSecondary}>
          The AfuChat name, logo, and all platform elements are owned by {COMPANY}. You may not copy, modify, distribute, or use our brand assets without express written permission.
        </Section>

        <Section title="10. Termination" color={colors.text} mutedColor={colors.textSecondary}>
          We reserve the right to suspend or terminate your account at any time for violations of these Terms or for conduct we deem harmful to our community. You may delete your account at any time from Settings › Account › Delete Account. Upon deletion, your data is purged according to our Privacy Policy.
        </Section>

        <Section title="11. Disclaimers & Limitation of Liability" color={colors.text} mutedColor={colors.textSecondary}>
          AfuChat is provided "as is" without warranties of any kind. To the maximum extent permitted by law, {COMPANY} shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the platform.{"\n\n"}
          We do not guarantee uninterrupted service availability. Scheduled maintenance may cause temporary outages.
        </Section>

        <Section title="12. Governing Law" color={colors.text} mutedColor={colors.textSecondary}>
          These Terms are governed by the laws of Uganda. Any disputes shall first be addressed through good-faith negotiation. If unresolved, disputes shall be submitted to the courts of Uganda.
        </Section>

        <Section title="13. Changes to These Terms" color={colors.text} mutedColor={colors.textSecondary}>
          We may update these Terms from time to time. We will notify you of significant changes via in-app notification or email. Continued use after the effective date constitutes acceptance of the revised Terms.
        </Section>

        <Section title="14. Contact" color={colors.text} mutedColor={colors.textSecondary}>
          For questions about these Terms, contact us at:{"\n\n"}
          {COMPANY}{"\n"}
          Email: {CONTACT_EMAIL}{"\n"}
          Website: https://afuchat.com
        </Section>

        <View style={s.footerLinks}>
          <TouchableOpacity onPress={() => router.push("/privacy" as any)}>
            <Text style={[s.footerLink, { color: "#1f95ff" }]}>View Privacy Policy →</Text>
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
      <Text style={[s.sectionBody, { color: mutedColor }]}>{children}</Text>
    </View>
  );
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
