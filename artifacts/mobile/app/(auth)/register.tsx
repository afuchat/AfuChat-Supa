import React, { useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";

import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { showAlert } from "@/lib/alert";
import { googleSignIn } from "@/lib/googleAuth";
import AfuLogo from "@/components/ui/AfuLogo";
import { GoogleLogo } from "@/components/ui/OAuthLogos";

// ─── AuthInput ────────────────────────────────────────────────────────────────
function AuthInput({ icon, placeholder, value, onChangeText, secureTextEntry, keyboardType, autoCapitalize, autoComplete, isDark, rightElement, onSubmitEditing, returnKeyType, inputRef, accent }: any) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[inp.wrap, {
      backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
      borderColor: focused ? accent + "80" : isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.09)",
      borderWidth: 1.5,
    }]}>
      <Ionicons name={icon} size={17} color={focused ? accent : isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.26)"} style={inp.icon} />
      <TextInput
        ref={inputRef}
        style={[inp.text, { color: isDark ? "#F1F1F1" : "#0F0F0F" }]}
        placeholder={placeholder}
        placeholderTextColor={isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.26)"}
        value={value} onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType} autoCapitalize={autoCapitalize ?? "none"}
        autoComplete={autoComplete} autoCorrect={false}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing} returnKeyType={returnKeyType ?? "next"}
      />
      {rightElement}
    </View>
  );
}
const inp = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", borderRadius: 100, paddingHorizontal: 14, height: 54 },
  icon: { marginRight: 10 },
  text: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", height: 54, outlineStyle: "none" } as any,
});

// ─── Checkbox ─────────────────────────────────────────────────────────────────
function Checkbox({ checked, onToggle, isDark, accent, children }: { checked: boolean; onToggle: () => void; isDark: boolean; accent: string; children: React.ReactNode }) {
  return (
    <TouchableOpacity style={cb.row} onPress={onToggle} activeOpacity={0.7}>
      <View style={[cb.box, {
        borderColor: checked ? accent : isDark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.18)",
        backgroundColor: checked ? accent : "transparent"
      }]}>
        {checked && <Ionicons name="checkmark" size={12} color="#fff" />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </TouchableOpacity>
  );
}
const cb = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0 },
});

// ─── GlassModal ───────────────────────────────────────────────────────────────
function GlassModal({ visible, onClose, isDark, children }: { visible: boolean; onClose: () => void; isDark: boolean; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[gm.overlay, { opacity, backgroundColor: isDark ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.48)" }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[gm.card, { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF", borderColor: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)", borderWidth: 0.5 }]}>
          {children}
        </View>
      </Animated.View>
    </Modal>
  );
}
const gm = StyleSheet.create({
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  card: { width: "100%", maxWidth: 420, borderRadius: 24, overflow: "hidden" },
});

// ─── EmailVerifyModal ─────────────────────────────────────────────────────────
function EmailVerifyModal({ visible, email, onClose, onVerified, isDark, accent }: { visible: boolean; email: string; onClose: () => void; onVerified: () => void; isDark: boolean; accent: string }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const sentRef = useRef(false);
  const textColor = isDark ? "#F1F1F1" : "#0F0F0F";
  const mutedColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)";

  useEffect(() => {
    if (visible && !sentRef.current && email) { sentRef.current = true; sendCode(); }
    if (!visible) { sentRef.current = false; setCode(""); }
  }, [visible, email]);

  async function sendCode() {
    setSending(true);
    await supabase.auth.resend({ type: "signup", email });
    setSending(false);
  }

  async function verify() {
    if (!code.trim()) return showAlert("Enter code", "Please enter the 6-digit code from your email.");
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "signup" });
    setLoading(false);
    if (error) showAlert("Invalid code", "The code is incorrect or expired. Try resending.");
    else onVerified();
  }

  return (
    <GlassModal visible={visible} onClose={onClose} isDark={isDark}>
      <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: textColor }}>Verify your email</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}><Ionicons name="close" size={20} color={mutedColor} /></TouchableOpacity>
        </View>
        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: mutedColor, marginBottom: 20, lineHeight: 20 }}>
          {sending ? "Sending verification code…" : `We sent a 6-digit code to ${email}`}
        </Text>
        <View style={{ gap: 12 }}>
          <AuthInput icon="keypad-outline" placeholder="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" isDark={isDark} returnKeyType="go" onSubmitEditing={verify} accent={accent} />
          <TouchableOpacity style={[sc.primaryBtn, (loading || sending) && { opacity: 0.6 }]} onPress={verify} disabled={loading || sending} activeOpacity={0.85}>
            <LinearGradient colors={[accent, "#1a7fd4"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sc.primaryGrad}>
              {(loading || sending) ? <ActivityIndicator color="#fff" size="small" /> : <Text style={sc.primaryText}>Verify email</Text>}
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setCode(""); sentRef.current = false; sendCode(); }} disabled={sending} style={{ alignSelf: "center", paddingVertical: 4 }}>
            <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>{sending ? "Sending…" : "Resend code"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </GlassModal>
  );
}

// ─── SignUpScreen ─────────────────────────────────────────────────────────────
export default function SignUpScreen() {
  const { isDark, colors } = useTheme();
  const { accent } = useAppAccent();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SW } = useWindowDimensions();
  // Only redirect already-logged-in users when this screen first mounts.
  // Do NOT react to `user` becoming set during the sign-up flow itself —
  // the sign-up handlers navigate explicitly. Reacting to [user] caused a
  // race: SIGNED_IN fires → setUser() → this effect → router.replace("/(tabs)/chats")
  // which overwrote the intentional router.replace("/onboarding") and sent
  // the new user back to the start of onboarding with a fresh (empty) state.
  useEffect(() => { if (user) router.replace("/(tabs)/chats"); }, []);

  const [step, setStep] = useState<"landing" | "email">("landing");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [ageOk, setAgeOk] = useState(false);
  const [termsOk, setTermsOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [verifyVisible, setVerifyVisible] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const [signupUserId, setSignupUserId] = useState<string | null>(null);
  const pwdRef = useRef<TextInput>(null);
  const oauthHandledRef = useRef(false);

  const textColor = isDark ? "#F1F1F1" : "#0F0F0F";
  const mutedColor = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.42)";
  const surfaceColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const borderColor = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.09)";

  // Slide animation
  const landingX = useRef(new Animated.Value(0)).current;
  const formX = useRef(new Animated.Value(SW)).current;

  function goToEmail() {
    setStep("email");
    Animated.parallel([
      Animated.spring(landingX, { toValue: -SW, useNativeDriver: true, tension: 200, friction: 28 }),
      Animated.spring(formX, { toValue: 0, useNativeDriver: true, tension: 200, friction: 28 }),
    ]).start();
  }

  function goToLanding() {
    setStep("landing");
    Animated.parallel([
      Animated.spring(landingX, { toValue: 0, useNativeDriver: true, tension: 200, friction: 28 }),
      Animated.spring(formX, { toValue: SW, useNativeDriver: true, tension: 200, friction: 28 }),
    ]).start();
  }

  // ── Signup ──────────────────────────────────────────────────────────────────
  async function handleSignup() {
    const e = email.trim();
    if (!e || !password) return showAlert("Missing fields", "Please enter your email and a password.");
    if (!ageOk) return showAlert("Age required", "You must confirm that you are 13 years of age or older.");
    if (!termsOk) return showAlert("Terms required", "You must agree to the Terms of Service and Privacy Policy.");
    if (password.length < 8) return showAlert("Password too short", "Password must be at least 8 characters.");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email: e, password });
    setLoading(false);
    if (error) { showAlert("Sign up failed", error.message); return; }
    if (data.user) {
      if (data.user.identities && data.user.identities.length === 0) {
        showAlert("Account exists", "An account with this email already exists. Please sign in instead.");
        router.replace("/(auth)/login"); return;
      }
      setSignupUserId(data.user.id);
      if (!data.session) { setVerifyEmail(e); setVerifyVisible(true); }
      else router.replace({ pathname: "/onboarding", params: { userId: data.user.id } } as any);
    }
  }

  // ── Google ──────────────────────────────────────────────────────────────────
  async function nativeGoogleSignIn() {
    setOauthLoading(true);
    const result = await googleSignIn();
    if (!result.ok) {
      setOauthLoading(false);
      if (result.cancelled) return;
      return webGoogleSignIn();
    }
    const uid = result.userId;
    if (uid) {
      const { data: prof } = await supabase.from("profiles").select("onboarding_completed").eq("id", uid).maybeSingle();
      if (!prof?.onboarding_completed) { setOauthLoading(false); router.replace({ pathname: "/onboarding", params: { userId: uid } } as any); return; }
    }
    setOauthLoading(false);
    router.replace("/(tabs)/chats");
  }

  async function webGoogleSignIn() {
    try {
      setOauthLoading(true);
      const redirectUrl = makeRedirectUri({ native: "afuchat://(auth)/register" });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUrl, skipBrowserRedirect: true, queryParams: { prompt: "select_account" } },
      });
      if (error) { showAlert("Error", error.message); setOauthLoading(false); return; }
      if (!data?.url) { setOauthLoading(false); return; }
      oauthHandledRef.current = false;
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl, { showInRecents: false });
      if (result.type === "success" && result.url) {
        const url = new URL(result.url);
        const code = url.searchParams.get("code");
        if (code) {
          const { data: sd, error: e } = await supabase.auth.exchangeCodeForSession(code);
          if (e) { showAlert("Error", e.message); }
          else {
            const uid = sd.user?.id;
            if (uid) {
              const { data: prof } = await supabase.from("profiles").select("onboarding_completed").eq("id", uid).maybeSingle();
              if (!prof?.onboarding_completed) { setOauthLoading(false); router.replace({ pathname: "/onboarding", params: { userId: uid } } as any); return; }
            }
            setOauthLoading(false); router.replace("/(tabs)/chats"); return;
          }
        }
        let at = url.hash ? new URLSearchParams(url.hash.substring(1)).get("access_token") : null;
        let rt = url.hash ? new URLSearchParams(url.hash.substring(1)).get("refresh_token") : null;
        if (!at) { at = url.searchParams.get("access_token"); rt = url.searchParams.get("refresh_token"); }
        if (at && rt) {
          const { error: e } = await supabase.auth.setSession({ access_token: at, refresh_token: rt });
          if (e) showAlert("Error", e.message);
          else router.replace("/(tabs)/chats");
        }
      }
      setOauthLoading(false);
    } catch { setOauthLoading(false); showAlert("Error", "Could not complete Google sign-in."); }
  }

  function handleGoogle() {
    nativeGoogleSignIn();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, overflow: "hidden" }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* ── LANDING PANEL ── */}
      <Animated.View
        style={[sc.panel, { transform: [{ translateX: landingX }], pointerEvents: step === "landing" ? "auto" : "none" } as any]}
      >
        <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }}>
          {/* Logo */}
          <View style={{ alignItems: "center", marginBottom: 52 }}>
            <AfuLogo size={64} />
          </View>

          <Text style={[sc.heading, { color: textColor }]}>Create account</Text>
          <Text style={[sc.subheading, { color: mutedColor }]}>
            Join AfuChat — free forever
          </Text>

          <View style={{ gap: 12, marginTop: 36 }}>
            <TouchableOpacity
              style={[sc.socialBtn, { backgroundColor: surfaceColor, borderColor }]}
              onPress={handleGoogle}
              disabled={oauthLoading}
              activeOpacity={0.78}
            >
              {oauthLoading ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <>
                  <GoogleLogo size={20} />
                  <Text style={[sc.socialBtnText, { color: textColor }]}>Continue with Google</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[sc.socialBtn, { backgroundColor: surfaceColor, borderColor }]}
              onPress={goToEmail}
              activeOpacity={0.78}
            >
              <Ionicons name="mail-outline" size={20} color={textColor} />
              <Text style={[sc.socialBtnText, { color: textColor }]}>Continue with email</Text>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 28 }}>
            <View style={{ flex: 1, height: 0.5, backgroundColor: borderColor }} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: mutedColor, letterSpacing: 0.4 }}>or</Text>
            <View style={{ flex: 1, height: 0.5, backgroundColor: borderColor }} />
          </View>

          <TouchableOpacity
            style={[sc.createBtn, { borderColor }]}
            onPress={() => router.replace("/(auth)/login")}
            activeOpacity={0.78}
          >
            <Text style={[sc.createBtnText, { color: accent }]}>Already have an account</Text>
          </TouchableOpacity>

          <View style={{ marginTop: "auto", paddingTop: 32, alignItems: "center", gap: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: mutedColor, textAlign: "center", lineHeight: 17, paddingHorizontal: 8 }}>
              By continuing, you agree to our{" "}
              <Text style={{ color: accent }} onPress={() => Linking.openURL("https://afuchat.com/terms").catch(() => {})}>Terms</Text>
              {" "}and{" "}
              <Text style={{ color: accent }} onPress={() => Linking.openURL("https://afuchat.com/privacy").catch(() => {})}>Privacy Policy</Text>
            </Text>
            <Text style={{ fontSize: 10.5, fontFamily: "Inter_400Regular", color: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.16)" }}>
              © {new Date().getFullYear()} AfuChat Technologies Limited
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* ── EMAIL FORM PANEL ── */}
      <Animated.View
        style={[sc.panel, { transform: [{ translateX: formX }], pointerEvents: step === "email" ? "auto" : "none" } as any]}
      >
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity onPress={goToLanding} style={sc.backBtn} hitSlop={14}>
              <Ionicons name="arrow-back" size={22} color={textColor} />
            </TouchableOpacity>

            <View style={{ marginTop: 28, marginBottom: 32 }}>
              <Text style={[sc.heading, { color: textColor }]}>Create account</Text>
              <Text style={[sc.subheading, { color: mutedColor }]}>
                Enter your details to get started
              </Text>
            </View>

            <View style={{ gap: 14 }}>
              <AuthInput
                icon="mail-outline" placeholder="Email address"
                value={email} onChangeText={setEmail}
                keyboardType="email-address" autoComplete="email"
                isDark={isDark} returnKeyType="next"
                onSubmitEditing={() => pwdRef.current?.focus()}
                accent={accent}
              />
              <AuthInput
                inputRef={pwdRef}
                icon="lock-closed-outline" placeholder="Password (min. 8 characters)"
                value={password} onChangeText={setPassword}
                secureTextEntry={!showPwd} autoComplete="new-password"
                isDark={isDark} returnKeyType="go" onSubmitEditing={handleSignup}
                accent={accent}
                rightElement={
                  <TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}>
                    <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={18} color={mutedColor} />
                  </TouchableOpacity>
                }
              />
            </View>

            <View style={{ gap: 14, marginTop: 20, marginBottom: 24 }}>
              <Checkbox checked={ageOk} onToggle={() => setAgeOk(p => !p)} isDark={isDark} accent={accent}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: mutedColor, lineHeight: 19, flex: 1 }}>
                  I confirm I am{" "}
                  <Text style={{ fontFamily: "Inter_600SemiBold", color: textColor }}>13 years of age or older</Text>
                </Text>
              </Checkbox>
              <Checkbox checked={termsOk} onToggle={() => setTermsOk(p => !p)} isDark={isDark} accent={accent}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: mutedColor, lineHeight: 19, flex: 1 }}>
                  I agree to the{" "}
                  <Text style={{ color: accent, fontFamily: "Inter_500Medium" }} onPress={() => Linking.openURL("https://afuchat.com/terms").catch(() => {})}>Terms of Service</Text>
                  {" "}and{" "}
                  <Text style={{ color: accent, fontFamily: "Inter_500Medium" }} onPress={() => Linking.openURL("https://afuchat.com/privacy").catch(() => {})}>Privacy Policy</Text>
                </Text>
              </Checkbox>
            </View>

            <TouchableOpacity
              style={[sc.primaryBtn, loading && { opacity: 0.62 }]}
              onPress={handleSignup}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[accent, "#1a7fd4"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sc.primaryGrad}>
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={sc.primaryText}>Create account</Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 24 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: mutedColor }}>Already have an account?</Text>
              <TouchableOpacity onPress={() => router.replace("/(auth)/login")} activeOpacity={0.7}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: accent }}>Sign in</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      <EmailVerifyModal
        visible={verifyVisible} email={verifyEmail}
        onClose={() => setVerifyVisible(false)}
        onVerified={() => {
          setVerifyVisible(false);
          if (signupUserId) router.replace({ pathname: "/onboarding", params: { userId: signupUserId } } as any);
          else router.replace("/(tabs)/chats");
        }}
        isDark={isDark} accent={accent}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const sc = StyleSheet.create({
  panel: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  heading: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.8,
    lineHeight: 40,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  socialBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  socialBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.1,
  },
  createBtn: {
    height: 54,
    borderRadius: 999,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  createBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtn: { borderRadius: 999, overflow: "hidden", marginTop: 4 },
  primaryGrad: { height: 56, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: -0.1 },
});
