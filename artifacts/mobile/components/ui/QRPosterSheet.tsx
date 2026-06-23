/**
 * QRPosterSheet — bottom sheet that displays a shareable QR profile poster.
 * Long-press the avatar on the profile tab to trigger this.
 *
 * Captures the poster as a PNG via react-native-view-shot (native)
 * or html2canvas (web), then offers Share / Save to Camera Roll.
 */
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Sharing from "expo-sharing";
import { showToast } from "@/lib/toast";
import QRCode from "@/components/ui/QRCode";
import VerifiedBadge from "@/components/ui/VerifiedBadge";

let ViewShot: any = ({ children, style, ...rest }: any) => <View style={style} {...rest}>{children}</View>;
let captureRef: ((ref: any, opts?: any) => Promise<string>) | null = null;
try {
  const vshot = require("react-native-view-shot");
  ViewShot = vshot.default;
  captureRef = vshot.captureRef;
} catch (_) {}

let MediaLibrary: any = null;
try { MediaLibrary = require("expo-media-library"); } catch (_) {}

const BRAND = "#1f95ff";
const CARD_BG = "#0a1628";
const CARD_GRAD_TOP = "#0d1e38";

type Props = {
  visible: boolean;
  onClose: () => void;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  afuId: string;
  isVerified?: boolean;
  isOrgVerified?: boolean;
};

export default function QRPosterSheet({
  visible, onClose,
  displayName, handle, avatarUrl,
  afuId, isVerified, isOrgVerified,
}: Props) {
  const posterRef = useRef<any>(null);
  const [saving, setSaving] = useState(false);

  const qrUrl = `https://afuchat.com/id/${afuId}`;

  async function capture(): Promise<string | null> {
    if (Platform.OS === "web") {
      const el = posterRef.current as HTMLElement | null;
      if (!el) return null;
      const h2c = (await import("html2canvas")).default;
      const canvas = await h2c(el, { useCORS: true, allowTaint: false, backgroundColor: CARD_BG, scale: 3, logging: false });
      return canvas.toDataURL("image/png");
    }
    if (!captureRef || !posterRef.current) return null;
    return captureRef(posterRef.current, { format: "png", quality: 1, result: "tmpfile" });
  }

  async function handleShare() {
    setSaving(true);
    try {
      const uri = await capture();
      if (!uri) { showToast("Could not generate image"); return; }
      if (Platform.OS === "web") {
        const a = document.createElement("a");
        a.href = uri;
        a.download = `afuchat-${handle}.png`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        showToast("Poster downloaded!");
      } else {
        const ok = await Sharing.isAvailableAsync();
        if (ok) await Sharing.shareAsync(uri, { mimeType: "image/png" });
        else showToast("Sharing not available on this device");
      }
    } catch (e) {
      showToast("Share failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (Platform.OS === "web") { handleShare(); return; }
    setSaving(true);
    try {
      if (!MediaLibrary) { showToast("Media library not available"); return; }
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") { showToast("Camera roll access denied"); return; }
      const uri = await capture();
      if (!uri) { showToast("Could not generate image"); return; }
      await MediaLibrary.saveToLibraryAsync(uri);
      showToast("Saved to camera roll! 📸");
    } catch {
      showToast("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity
        style={s.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={s.sheet}>
        {/* Handle bar */}
        <View style={s.handleRow}>
          <View style={s.handle} />
        </View>

        <Text style={s.sheetTitle}>Your AfuChat QR Poster</Text>
        <Text style={s.sheetSub}>Long-press or share with anyone — they can scan it to find you instantly.</Text>

        {/* Poster card — this gets captured */}
        <View style={s.posterWrap}>
          <ViewShot
            ref={posterRef}
            options={{ format: "png", quality: 1, result: "tmpfile" }}
            style={s.poster}
          >
            {/* Background */}
            <View style={s.posterBg}>
              {/* Top brand strip */}
              <View style={s.brandStrip}>
                <View style={s.logoMark}><Text style={s.logoMarkText}>A</Text></View>
                <Text style={s.brandName}>AfuChat</Text>
              </View>

              {/* Avatar */}
              <View style={s.avatarWrap}>
                {avatarUrl ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={s.avatar}
                    contentFit="cover"
                    cachePolicy="memory"
                  />
                ) : (
                  <View style={[s.avatar, s.avatarFallback]}>
                    <Text style={s.avatarInitial}>{(displayName || handle || "?")[0].toUpperCase()}</Text>
                  </View>
                )}
                {(isVerified || isOrgVerified) && (
                  <View style={s.badgeWrap}>
                    <VerifiedBadge isVerified={isVerified} isOrganizationVerified={isOrgVerified} size={18} />
                  </View>
                )}
              </View>

              {/* Name + handle */}
              <Text style={s.posterName} numberOfLines={1}>{displayName}</Text>
              <Text style={s.posterHandle}>@{handle}</Text>

              {/* QR code */}
              <View style={s.qrWrap}>
                <QRCode value={qrUrl} size={130} color="#0a1628" backgroundColor="#ffffff" />
              </View>

              <Text style={s.posterScan}>Scan to connect on AfuChat</Text>
              <Text style={s.posterUrl}>afuchat.com/id/{afuId}</Text>
            </View>
          </ViewShot>
        </View>

        {/* Action buttons */}
        <View style={s.btnRow}>
          <TouchableOpacity
            style={[s.btn, s.btnPrimary]}
            onPress={handleShare}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="share-social-outline" size={18} color="#fff" />
                <Text style={s.btnTextPrimary}>Share</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.btn, s.btnSecondary]}
            onPress={handleSave}
            disabled={saving}
          >
            <Ionicons name="download-outline" size={18} color={BRAND} />
            <Text style={s.btnTextSecondary}>Save Image</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={s.closeBtn} onPress={onClose}>
          <Text style={s.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111827",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 36,
    paddingHorizontal: 20,
  },
  handleRow: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)" },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: "#fff", textAlign: "center", marginTop: 8 },
  sheetSub: { fontSize: 13, color: "rgba(255,255,255,0.45)", textAlign: "center", marginTop: 4, marginBottom: 20, lineHeight: 19 },

  posterWrap: { alignItems: "center", marginBottom: 20 },
  poster: { borderRadius: 20, overflow: "hidden" },
  posterBg: {
    width: 280,
    backgroundColor: CARD_BG,
    borderRadius: 20,
    alignItems: "center",
    paddingBottom: 24,
    borderWidth: 1,
    borderColor: "rgba(31,149,255,0.2)",
  },

  brandStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 16,
    paddingBottom: 20,
    width: "100%",
    paddingHorizontal: 18,
    backgroundColor: CARD_GRAD_TOP,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(31,149,255,0.12)",
    marginBottom: 20,
  },
  logoMark: { width: 26, height: 26, borderRadius: 8, backgroundColor: BRAND, alignItems: "center", justifyContent: "center" },
  logoMarkText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  brandName: { color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },

  avatarWrap: { position: "relative", marginBottom: 12 },
  avatar: { width: 80, height: 80, borderRadius: 40, borderWidth: 2.5, borderColor: BRAND + "60" },
  avatarFallback: { backgroundColor: BRAND + "22", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 32, fontWeight: "700", color: BRAND },
  badgeWrap: { position: "absolute", bottom: 0, right: -2 },

  posterName: { fontSize: 18, fontWeight: "700", color: "#fff", textAlign: "center", paddingHorizontal: 16 },
  posterHandle: { fontSize: 13, color: "rgba(255,255,255,0.45)", marginTop: 3, marginBottom: 16 },

  qrWrap: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 14,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  posterScan: { fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: 0.4, marginBottom: 4 },
  posterUrl: { fontSize: 10, color: BRAND + "88", letterSpacing: 0.3, fontFamily: "monospace" as any },

  btnRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  btn: { flex: 1, height: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  btnPrimary: { backgroundColor: BRAND },
  btnSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: BRAND + "55" },
  btnTextPrimary: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnTextSecondary: { color: BRAND, fontWeight: "600", fontSize: 15 },

  closeBtn: { alignItems: "center", paddingVertical: 10 },
  closeBtnText: { color: "rgba(255,255,255,0.35)", fontSize: 14 },
});
