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
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { supabase } from "@/lib/supabase";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/env";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { useAppAccent } from "@/context/AppAccentContext";
import { showAlert } from "@/lib/alert";
import { googleSignIn } from "@/lib/googleAuth";
import AfuLogo from "@/components/ui/AfuLogo";
import { GoogleLogo } from "@/components/ui/OAuthLogos";

const BIO_REFRESH_KEY = "afu_bio_refresh_token";
const BIO_EMAIL_KEY = "afu_bio_display_email";

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

// ─── ForgotPasswordModal ──────────────────────────────────────────────────────
function ForgotPasswordModal({ visible, onClose, isDark, accent }: { visible: boolean; onClose: () => void; isDark: boolean; accent: string }) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.30)";
  const textColor = isDark ? "#F1F1F1" : "#0F0F0F";

  useEffect(() => {
    if (!visible) {
      const t = setTimeout(() => { setStep("email"); setEmail(""); setCode(""); setNewPwd(""); setConfirmPwd(""); }, 250);
      return () => clearTimeout(t);
    }
  }, [visible]);

  async function sendCode() {
    if (!email.trim()) return showAlert("Enter email", "Please enter your email address.");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: "https://afuchat.com/" });
    setLoading(false);
    if (error) showAlert("Error", error.message);
    else setStep("code");
  }

  async function doReset() {
    if (!code.trim()) return showAlert("Enter code", "Check your email for the 6-digit code.");
    if (newPwd.length < 6) return showAlert("Too short", "Password must be at least 6 characters.");
    if (newPwd !== confirmPwd) return showAlert("Mismatch", "Passwords don't match.");
    setLoading(true);
    const { error: e1 } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "recovery" });
    if (e1) { setLoading(false); return showAlert("Invalid code", "The code is invalid or expired."); }
    const { error: e2 } = await supabase.auth.updateUser({ password: newPwd });
    setLoading(false);
    if (e2) showAlert("Error", e2.message);
    else { showAlert("Password updated", "Your password has been changed. Please sign in."); await supabase.auth.signOut(); onClose(); }
  }

  return (
    <GlassModal visible={visible} onClose={onClose} isDark={isDark}>
      <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <Text style={{ fontSize: 20, fontFamily: "Inter_700Bold", color: textColor }}>
            {step === "email" ? "Reset password" : "New password"}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={20} color={mutedColor} />
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 13, fontFamily: "Inter_400Regular", color: mutedColor, marginBottom: 20 }}>
          {step === "email" ? "Enter your email to receive a reset code" : `Reset code sent to ${email}`}
        </Text>
        <View style={{ gap: 12 }}>
          {step === "email" ? (
            <>
              <AuthInput icon="mail-outline" placeholder="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" isDark={isDark} returnKeyType="go" onSubmitEditing={sendCode} accent={accent} />
              <TouchableOpacity style={[sc.primaryBtn, loading && { opacity: 0.6 }]} onPress={sendCode} disabled={loading} activeOpacity={0.85}>
                <LinearGradient colors={[accent, "#1a7fd4"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sc.primaryGrad}>
                  {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={sc.primaryText}>Send reset code</Text>}
                </LinearGradient>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <AuthInput icon="keypad-outline" placeholder="6-digit code from email" value={code} onChangeText={setCode} keyboardType="number-pad" isDark={isDark} accent={accent} />
              <AuthInput icon="lock-closed-outline" placeholder="New password" value={newPwd} onChangeText={setNewPwd} secureTextEntry={!showPwd} isDark={isDark} accent={accent}
                rightElement={<TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}><Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={17} color={mutedColor} /></TouchableOpacity>}
              />
              <AuthInput icon="lock-closed-outline" placeholder="Confirm password" value={confirmPwd} onChangeText={setConfirmPwd} secureTextEntry={!showPwd} isDark={isDark} returnKeyType="go" onSubmitEditing={doReset} accent={accent} />
              <TouchableOpacity style={[sc.primaryBtn, loading && { opacity: 0.6 }]} onPress={doReset} disabled={loading} activeOpacity={0.85}>
                <LinearGradient colors={[accent, "#1a7fd4"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sc.primaryGrad}>
                  {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={sc.primaryText}>Update password</Text>}
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setStep("email")} style={{ alignSelf: "center", paddingVertical: 4 }}>
                <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: accent }}>← Back / Resend</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </GlassModal>
  );
}

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

// ─── SignInScreen ─────────────────────────────────────────────────────────────
export default function SignInScreen() {
  const { isDark, colors } = useTheme();
  const { accent } = useAppAccent();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: SW } = useWindowDimensions();
  useEffect(() => { if (user) router.replace("/(tabs)/chats"); }, [user]);

  const [step, setStep] = useState<"landing" | "email">("landing");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [forgotVisible, setForgotVisible] = useState(false);
  const [verifyVisible, setVerifyVisible] = useState(false);
  const [verifyEmail, setVerifyEmail] = useState("");
  const pwdRef = useRef<TextInput>(null);
  const oauthHandledRef = useRef(false);
  // Synchronous in-flight guard — prevents double-submission when the keyboard
  // "Done" key and the Sign In button fire handleLogin in the same event tick
  // before React has flushed the setLoading(true) state update.
  const isSubmittingRef = useRef(false);

  // ── Biometric state ─────────────────────────────────────────────────────────
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioStored, setBioStored] = useState(false);
  const [bioLabel, setBioLabel] = useState<"Face ID" | "Touch ID" | "Biometrics">("Biometrics");
  const [bioIcon, setBioIcon] = useState<"scan-outline" | "finger-print-outline">("scan-outline");
  const [bioLoading, setBioLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [hw, enrolled] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
        ]);
        if (!hw || !enrolled) return;
        setBioAvailable(true);
        const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
        if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
          setBioLabel("Face ID");
          setBioIcon("scan-outline");
        } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
          setBioLabel("Touch ID");
          setBioIcon("finger-print-outline");
        }
        const stored = await SecureStore.getItemAsync(BIO_REFRESH_KEY);
        setBioStored(!!stored);
      } catch {}
    })();
  }, []);

  // Store refresh token after login for future biometric use
  async function storeSessionForBio(refreshToken: string, email: string) {
    if (!bioAvailable) return;
    try {
      await SecureStore.setItemAsync(BIO_REFRESH_KEY, refreshToken);
      await SecureStore.setItemAsync(BIO_EMAIL_KEY, email);
      setBioStored(true);
    } catch {}
  }

  async function handleBioSignIn() {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setBioLoading(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Sign in to AfuChat`,
        cancelLabel: "Use password",
        disableDeviceFallback: false,
      });
      if (!result.success) { setBioLoading(false); return; }

      const storedToken = await SecureStore.getItemAsync(BIO_REFRESH_KEY);
      if (!storedToken) {
        setBioStored(false);
        setBioLoading(false);
        return showAlert("Session expired", "Please sign in with your email or Google.");
      }

      const { data, error } = await supabase.auth.refreshSession({ refresh_token: storedToken });
      if (error || !data.session) {
        await SecureStore.deleteItemAsync(BIO_REFRESH_KEY);
        setBioStored(false);
        setBioLoading(false);
        return showAlert("Session expired", "Please sign in again to re-enable biometrics.");
      }

      // Rotate the stored token
      await SecureStore.setItemAsync(BIO_REFRESH_KEY, data.session.refresh_token);
      setBioLoading(false);
      router.replace("/(tabs)/chats");
    } catch {
      setBioLoading(false);
      showAlert("Error", "Biometric authentication failed.");
    } finally {
      isSubmittingRef.current = false;
    }
  }

  const textColor = isDark ? "#F1F1F1" : "#0F0F0F";
  const mutedColor = isDark ? "rgba(255,255,255,0.42)" : "rgba(0,0,0,0.42)";
  const surfaceColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const borderColor = isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.09)";

  // Slide animation between landing ↔ email form
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

  // ── Identifier helpers ──────────────────────────────────────────────────────
  function detectType(raw: string): "email" | "handle" | "phone" {
    const s = raw.trim();
    if (s.includes("@") && /\.\w+$/.test(s.split("@")[1] ?? "")) return "email";
    if (s.startsWith("+") || /^\d{7,15}$/.test(s.replace(/[\s\-()+]/g, ""))) return "phone";
    return "handle";
  }

  async function resolveToEmail(raw: string): Promise<string | null> {
    try {
      const base = SUPABASE_URL;
      const anon = SUPABASE_ANON_KEY;
      const res = await fetch(`${base}/functions/v1/auth-resolve-identifier`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anon },
        body: JSON.stringify({ identifier: raw.trim() }),
      });
      const json = await res.json();
      return json.email ?? null;
    } catch { return null; }
  }

  // ── Login ───────────────────────────────────────────────────────────────────
  async function handleLogin() {
    // Synchronous guard: blocks double-fire when the keyboard "Done" key and the
    // Sign In button both call this function in the same event loop tick before
    // React has flushed the setLoading(true) state update.
    if (isSubmittingRef.current) return;
    const raw = identifier.trim();
    if (!raw || !password) return showAlert("Missing fields", "Please enter your email/username and password.");

    isSubmittingRef.current = true;
    setLoading(true);

    if (__DEV__) {
      console.log("[Auth] signInWithPassword →", raw, new Date().toISOString());
    }

    try {
      let resolvedEmail = raw;
      const type = detectType(raw);
      if (type !== "email") {
        const found = await resolveToEmail(raw);
        if (!found) {
          setLoading(false);
          showAlert("Account not found", type === "handle" ? "No account found for that username." : "No account found for that phone number.");
          return;
        }
        resolvedEmail = found;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email: resolvedEmail, password });

      if (error) {
        setLoading(false);
        const msg = error.message ?? "";
        const msgL = msg.toLowerCase();
        const isRateLimit =
          error.status === 429 ||
          msgL.includes("rate limit") ||
          msgL.includes("too many requests") ||
          msgL.includes("over_email_send_rate_limit") ||
          msgL.includes("email rate limit exceeded") ||
          msgL.includes("too many sign");
        if (isRateLimit) {
          showAlert(
            "Too many attempts",
            "You've made too many sign-in attempts.\n\nPlease wait a few minutes before trying again."
          );
        } else {
          showAlert("Sign in failed", msg || "An unexpected error occurred. Please try again.");
        }
        return;
      }

      if (data.user) {
        if (!data.user.email_confirmed_at) {
          await supabase.auth.signOut();
          setLoading(false);
          setVerifyEmail(resolvedEmail); setVerifyVisible(true); return;
        }
        const { data: prof } = await supabase.from("profiles").select("scheduled_deletion_at, account_deleted").eq("id", data.user.id).single();
        if (prof?.account_deleted) {
          setLoading(false); await supabase.auth.signOut();
          showAlert("Account Deleted", "This account has been permanently deleted."); return;
        }
        if (prof?.scheduled_deletion_at) {
          const days = Math.max(0, Math.ceil((new Date(prof.scheduled_deletion_at).getTime() - Date.now()) / 86400000));
          setLoading(false);
          showAlert("Account Scheduled for Deletion", `Your account will be deleted in ${days} day${days !== 1 ? "s" : ""}. Restore it?`, [
            { text: "Delete Anyway", style: "destructive", onPress: async () => supabase.auth.signOut() },
            { text: "Restore", style: "default", onPress: async () => { await supabase.from("profiles").update({ scheduled_deletion_at: null }).eq("id", data.user!.id); router.replace("/(tabs)/chats"); } },
          ]); return;
        }
      }

      // Store session for biometric on future visits (fire-and-forget)
      if (data.session) {
        storeSessionForBio(data.session.refresh_token, resolvedEmail);
      }
      setLoading(false);
      router.replace("/(tabs)/chats");
    } finally {
      // Always release the in-flight lock so the button becomes tappable again
      // even if an unexpected error propagates past all the catch sites above.
      isSubmittingRef.current = false;
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
      const redirectUrl = makeRedirectUri({ native: "afuchat://(auth)/login" });
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

  const idType = detectType(identifier);
  const idIcon = idType === "email" ? "mail-outline" : idType === "phone" ? "call-outline" : "at-outline";
  const showBioBtn = bioAvailable && bioStored;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, overflow: "hidden" }}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* ── LANDING PANEL ── */}
      <Animated.View
        style={[sc.panel, { transform: [{ translateX: landingX }], pointerEvents: step === "landing" ? "auto" : "none" } as any]}
      >
        <View style={{ flex: 1, paddingHorizontal: 28, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }}>
          {/* Logo */}
          <View style={{ alignItems: "center", marginBottom: showBioBtn ? 36 : 52 }}>
            <AfuLogo size={64} />
          </View>

          {/* Biometric quick-sign-in — shown when hardware + stored token available */}
          {showBioBtn && (
            <View style={{ alignItems: "center", marginBottom: 32 }}>
              <TouchableOpacity
                style={[sc.bioCircle, { borderColor: accent + "40", backgroundColor: accent + "10" }]}
                onPress={handleBioSignIn}
                disabled={bioLoading}
                activeOpacity={0.82}
              >
                {bioLoading
                  ? <ActivityIndicator size="large" color={accent} />
                  : <Ionicons name={bioIcon} size={34} color={accent} />
                }
              </TouchableOpacity>
              <Text style={{ marginTop: 10, fontSize: 13, fontFamily: "Inter_600SemiBold", color: accent, letterSpacing: 0.1 }}>
                {bioLoading ? "Verifying…" : `Sign in with ${bioLabel}`}
              </Text>
              <Text style={{ marginTop: 4, fontSize: 11.5, fontFamily: "Inter_400Regular", color: mutedColor }}>
                Tap to unlock instantly
              </Text>
            </View>
          )}

          {/* Heading */}
          <Text style={[sc.heading, { color: textColor }]}>Welcome back</Text>
          <Text style={[sc.subheading, { color: mutedColor }]}>
            Sign in to your AfuChat account
          </Text>

          <View style={{ gap: 12, marginTop: 28 }}>
            {/* Google */}
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

            {/* Email */}
            <TouchableOpacity
              style={[sc.socialBtn, { backgroundColor: surfaceColor, borderColor }]}
              onPress={goToEmail}
              activeOpacity={0.78}
            >
              <Ionicons name="mail-outline" size={20} color={textColor} />
              <Text style={[sc.socialBtnText, { color: textColor }]}>Continue with email</Text>
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 24 }}>
            <View style={{ flex: 1, height: 0.5, backgroundColor: borderColor }} />
            <Text style={{ fontSize: 12, fontFamily: "Inter_500Medium", color: mutedColor, letterSpacing: 0.4 }}>or</Text>
            <View style={{ flex: 1, height: 0.5, backgroundColor: borderColor }} />
          </View>

          {/* Create account */}
          <TouchableOpacity
            style={[sc.createBtn, { borderColor }]}
            onPress={() => router.push("/(auth)/register")}
            activeOpacity={0.78}
          >
            <Text style={[sc.createBtnText, { color: accent }]}>Create a new account</Text>
          </TouchableOpacity>

          {/* Footer */}
          <View style={{ marginTop: "auto", paddingTop: 28, alignItems: "center", gap: 6 }}>
            <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
              <Text style={[sc.footerLink, { color: accent }]} onPress={() => Linking.openURL("https://afuchat.com/terms").catch(() => {})}>Terms</Text>
              <Text style={{ color: mutedColor, fontSize: 12 }}>·</Text>
              <Text style={[sc.footerLink, { color: accent }]} onPress={() => Linking.openURL("https://afuchat.com/privacy").catch(() => {})}>Privacy</Text>
              <Text style={{ color: mutedColor, fontSize: 12 }}>·</Text>
              <Text style={[sc.footerLink, { color: accent }]} onPress={() => router.push("/help")}>Help</Text>
            </View>
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
            {/* Back */}
            <TouchableOpacity onPress={goToLanding} style={sc.backBtn} hitSlop={14}>
              <Ionicons name="arrow-back" size={22} color={textColor} />
            </TouchableOpacity>

            <View style={{ marginTop: 28, marginBottom: 36 }}>
              <Text style={[sc.heading, { color: textColor }]}>Sign in</Text>
              <Text style={[sc.subheading, { color: mutedColor }]}>
                Enter your credentials to continue
              </Text>
            </View>

            <View style={{ gap: 14 }}>
              <AuthInput
                icon={idIcon}
                placeholder="Email, @username, or phone"
                value={identifier} onChangeText={setIdentifier}
                keyboardType={idType === "phone" ? "phone-pad" : "email-address"}
                autoComplete="username" isDark={isDark}
                returnKeyType="next" onSubmitEditing={() => pwdRef.current?.focus()}
                accent={accent}
              />
              <AuthInput
                inputRef={pwdRef}
                icon="lock-closed-outline" placeholder="Password"
                value={password} onChangeText={setPassword}
                secureTextEntry={!showPwd} autoComplete="current-password"
                isDark={isDark} returnKeyType="go" onSubmitEditing={handleLogin}
                accent={accent}
                rightElement={
                  <TouchableOpacity onPress={() => setShowPwd(p => !p)} style={{ padding: 4 }}>
                    <Ionicons name={showPwd ? "eye-off-outline" : "eye-outline"} size={18} color={mutedColor} />
                  </TouchableOpacity>
                }
              />
            </View>

            <TouchableOpacity onPress={() => setForgotVisible(true)} style={{ alignSelf: "flex-end", paddingVertical: 10, marginBottom: 8 }}>
              <Text style={{ fontSize: 13.5, fontFamily: "Inter_500Medium", color: accent }}>Forgot password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[sc.primaryBtn, loading && { opacity: 0.62 }]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient colors={[accent, "#1a7fd4"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={sc.primaryGrad}>
                {loading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={sc.primaryText}>Sign in</Text>
                }
              </LinearGradient>
            </TouchableOpacity>

            <View style={{ flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 24 }}>
              <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: mutedColor }}>Don't have an account?</Text>
              <TouchableOpacity onPress={() => router.push("/(auth)/register")} activeOpacity={0.7}>
                <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", color: accent }}>Sign up</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Animated.View>

      <ForgotPasswordModal visible={forgotVisible} onClose={() => setForgotVisible(false)} isDark={isDark} accent={accent} />
      <EmailVerifyModal
        visible={verifyVisible} email={verifyEmail}
        onClose={() => setVerifyVisible(false)}
        onVerified={() => { setVerifyVisible(false); router.replace("/(tabs)/chats"); }}
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
  bioCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
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
  footerLink: { fontSize: 12.5, fontFamily: "Inter_500Medium" },
});
