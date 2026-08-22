import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { showAlert } from "@/lib/alert";
import * as Haptics from "@/lib/haptics";
import Colors from "@/constants/colors";

type Service = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
  category: string;
  description: string;
  accountLabel: string;
  accountPlaceholder: string;
  amountSuggestions: number[];
};

const SERVICES: Service[] = [
  { id: "airtime", label: "Airtime", icon: "phone-portrait", color: "#34C759", category: "Mobile", description: "Top up any network in seconds", accountLabel: "Phone Number", accountPlaceholder: "07XXXXXXXX", amountSuggestions: [100, 200, 500, 1000] },
  { id: "data", label: "Data Bundle", icon: "wifi", color: "#007AFF", category: "Mobile", description: "Buy data for any network", accountLabel: "Phone Number", accountPlaceholder: "07XXXXXXXX", amountSuggestions: [50, 100, 500, 1000] },
  { id: "electricity", label: "Electricity", icon: "flash", color: "#FF9500", category: "Utilities", description: "Pay electricity bills", accountLabel: "Meter Number", accountPlaceholder: "Meter / Account No.", amountSuggestions: [500, 1000, 2000, 5000] },
  { id: "water", label: "Water", icon: "water", color: "#5AC8FA", category: "Utilities", description: "Pay water utility bills", accountLabel: "Account Number", accountPlaceholder: "Water Account No.", amountSuggestions: [500, 1000, 2000, 5000] },
  { id: "tv", label: "TV / DStv", icon: "tv", color: "#AF52DE", category: "Entertainment", description: "Pay for subscription TV", accountLabel: "Smart Card / IUC No.", accountPlaceholder: "Smart Card Number", amountSuggestions: [1099, 2499, 4999, 7999] },
  { id: "internet", label: "Internet", icon: "globe", color: "#1018D8", category: "Utilities", description: "Pay broadband & ISP bills", accountLabel: "Account / Username", accountPlaceholder: "ISP Account No.", amountSuggestions: [500, 1000, 2000, 5000] },
  { id: "insurance", label: "Insurance", icon: "shield-checkmark", color: "#FF6B35", category: "Finance", description: "Pay insurance premiums", accountLabel: "Policy Number", accountPlaceholder: "Policy No.", amountSuggestions: [500, 1000, 2500, 5000] },
  { id: "tax", label: "Tax", icon: "document-text", color: "#8E8E93", category: "Finance", description: "Pay government taxes", accountLabel: "Tax ID / PIN", accountPlaceholder: "KRA PIN / TIN", amountSuggestions: [1000, 5000, 10000, 50000] },
  { id: "school", label: "School Fees", icon: "school", color: "#5856D6", category: "Education", description: "Pay tuition & school fees", accountLabel: "Student / Admission No.", accountPlaceholder: "Admission Number", amountSuggestions: [5000, 10000, 25000, 50000] },
  { id: "hospital", label: "Hospital Bills", icon: "medical", color: "#FF3B30", category: "Health", description: "Pay medical bills", accountLabel: "Patient / Bill No.", accountPlaceholder: "Bill Number", amountSuggestions: [500, 1000, 5000, 10000] },
  { id: "fuel", label: "Fuel Voucher", icon: "car", color: "#FF9500", category: "Transport", description: "Prepay fuel vouchers", accountLabel: "Vehicle Plate / Phone", accountPlaceholder: "Plate / Phone No.", amountSuggestions: [500, 1000, 2000, 5000] },
  { id: "rent", label: "Rent", icon: "home", color: "#34C759", category: "Housing", description: "Pay rent digitally", accountLabel: "Landlord / Paybill No.", accountPlaceholder: "Paybill / Till No.", amountSuggestions: [5000, 10000, 20000, 50000] },
];

const CATEGORY_FILTERS = ["All", ...Array.from(new Set(SERVICES.map((s) => s.category)))];

type Screen = "list" | "pay";

export default function AfuServicesApp() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [selectedCat, setSelectedCat] = useState("All");
  const [screen, setScreen] = useState<Screen>("list");
  const [activeService, setActiveService] = useState<Service | null>(null);
  const [accountNo, setAccountNo] = useState("");
  const [amount, setAmount] = useState("");
  const [paying, setPaying] = useState(false);

  const filtered = selectedCat === "All" ? SERVICES : SERVICES.filter((s) => s.category === selectedCat);

  function openService(service: Service) {
    setActiveService(service);
    setAccountNo("");
    setAmount("");
    setScreen("pay");
    Haptics.selectionAsync();
  }

  async function handlePay() {
    if (!user) {
      showAlert("Sign in required", "Please sign in to make payments.");
      return;
    }
    if (!accountNo.trim()) {
      showAlert("Missing details", `Please enter your ${activeService?.accountLabel ?? "account number"}.`);
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      showAlert("Invalid amount", "Please enter a valid payment amount.");
      return;
    }
    setPaying(true);
    Haptics.selectionAsync();
    try {
      // Record the service payment request in Supabase
      const { error } = await supabase.from("service_payments").insert({
        user_id: user.id,
        service_id: activeService!.id,
        service_label: activeService!.label,
        account_number: accountNo.trim(),
        amount: amt,
        currency: "KES",
        status: "pending",
      });
      if (error) {
        throw error;
      }
      setPaying(false);
      setScreen("list");
      showAlert(
        "Payment Submitted",
        `Your ${activeService!.label} payment of KES ${amt.toLocaleString()} to ${accountNo.trim()} has been submitted and is being processed.`,
        [{ text: "OK" }]
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setPaying(false);
      showAlert("Error", "Unable to process payment. Please try again.");
    }
  }

  if (screen === "pay" && activeService) {
    return (
      <KeyboardAvoidingView
        style={[s.root, { backgroundColor: colors.background }]}
        behavior={undefined}
      >
        <View style={[s.payHeader, { borderBottomColor: colors.border }]}>
          <TouchableOpacity style={s.backBtn} onPress={() => setScreen("list")}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={[s.payHeaderIcon, { backgroundColor: activeService.color + "18" }]}>
            <Ionicons name={activeService.icon} size={20} color={activeService.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.payHeaderTitle, { color: colors.text }]}>{activeService.label}</Text>
            <Text style={[s.payHeaderSub, { color: colors.textMuted }]}>{activeService.description}</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[s.payBody, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{activeService.accountLabel.toUpperCase()}</Text>
          <View style={[s.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Ionicons name="card-outline" size={18} color={colors.textMuted} />
            <TextInput
              style={[s.input, { color: colors.text }]}
              placeholder={activeService.accountPlaceholder}
              placeholderTextColor={colors.textMuted}
              value={accountNo}
              onChangeText={setAccountNo}
              keyboardType="default"
              autoCapitalize="characters"
            />
          </View>

          <Text style={[s.fieldLabel, { color: colors.textSecondary, marginTop: 20 }]}>AMOUNT (KES)</Text>
          <View style={[s.inputWrap, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
            <Text style={[s.currencySymbol, { color: colors.textMuted }]}>KES</Text>
            <TextInput
              style={[s.input, { color: colors.text }]}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
            />
          </View>

          <Text style={[s.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>QUICK AMOUNTS</Text>
          <View style={s.suggestRow}>
            {activeService.amountSuggestions.map((amt) => (
              <TouchableOpacity
                key={amt}
                style={[
                  s.suggestChip,
                  {
                    backgroundColor: amount === String(amt) ? activeService.color : colors.inputBg,
                    borderColor: amount === String(amt) ? activeService.color : colors.border,
                  },
                ]}
                onPress={() => { setAmount(String(amt)); Haptics.selectionAsync(); }}
              >
                <Text style={[s.suggestText, { color: amount === String(amt) ? "#fff" : colors.textSecondary }]}>
                  {amt >= 1000 ? `${(amt / 1000).toFixed(amt % 1000 === 0 ? 0 : 2)}K` : amt}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {parseFloat(amount) > 0 && (
            <View style={[s.summaryCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={s.summaryRow}>
                <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Service</Text>
                <Text style={[s.summaryValue, { color: colors.text }]}>{activeService.label}</Text>
              </View>
              <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={s.summaryRow}>
                <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Account</Text>
                <Text style={[s.summaryValue, { color: colors.text }]}>{accountNo || "—"}</Text>
              </View>
              <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
              <View style={s.summaryRow}>
                <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Amount</Text>
                <Text style={[s.summaryValue, { color: activeService.color, fontFamily: "Inter_700Bold" }]}>KES {parseFloat(amount).toLocaleString()}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[s.payBtn, { backgroundColor: activeService.color, opacity: paying ? 0.7 : 1 }]}
            onPress={handlePay}
            disabled={paying}
            activeOpacity={0.85}
          >
            {paying ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={s.payBtnText}>Pay Now</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient colors={["#1A0A2E", "#0D0517"]} style={s.hero}>
        <Ionicons name="card" size={32} color="#AF52DE" />
        <Text style={s.heroTitle}>AfuServices</Text>
        <Text style={s.heroSub}>Pay bills, utilities, and more across Africa</Text>
      </LinearGradient>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
        {CATEGORY_FILTERS.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[s.catBtn, { backgroundColor: selectedCat === cat ? "#AF52DE" : colors.inputBg, borderColor: selectedCat === cat ? "#AF52DE" : colors.border }]}
            onPress={() => setSelectedCat(cat)}
          >
            <Text style={[s.catText, { color: selectedCat === cat ? "#fff" : colors.textMuted }]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={s.grid}>
        {filtered.map((service) => (
          <TouchableOpacity
            key={service.id}
            style={[s.serviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => openService(service)}
            activeOpacity={0.8}
          >
            <View style={[s.serviceIcon, { backgroundColor: service.color + "18" }]}>
              <Ionicons name={service.icon} size={24} color={service.color} />
            </View>
            <Text style={[s.serviceLabel, { color: colors.text }]}>{service.label}</Text>
            <Text style={[s.serviceDesc, { color: colors.textMuted }]} numberOfLines={2}>{service.description}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  hero: { margin: 16, borderRadius: 20, padding: 24, alignItems: "center", gap: 6 },
  heroTitle: { color: "#fff", fontSize: 20, fontFamily: "Inter_700Bold" },
  heroSub: { color: "rgba(255,255,255,0.6)", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  catRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  catBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  catText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  grid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, gap: 10 },
  serviceCard: { width: "47%", borderRadius: 16, borderWidth: 0.5, padding: 14, gap: 8 },
  serviceIcon: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  serviceLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  serviceDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  payHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  backBtn: { padding: 4 },
  payHeaderIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  payHeaderTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  payHeaderSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  payBody: { padding: 20 },
  fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5, marginBottom: 8 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13 },
  input: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular" },
  currencySymbol: { fontSize: 15, fontFamily: "Inter_600SemiBold", width: 38 },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  suggestChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 24, borderWidth: 1 },
  suggestText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  summaryCard: { borderRadius: 16, borderWidth: 0.5, overflow: "hidden", marginTop: 24 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  summaryDivider: { height: 0.5 },
  summaryLabel: { fontSize: 13, fontFamily: "Inter_400Regular" },
  summaryValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  payBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 15, marginTop: 20 },
  payBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
});
