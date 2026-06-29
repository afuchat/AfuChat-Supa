import React, { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { Avatar } from "@/components/ui/Avatar";
import { showAlert } from "@/lib/alert";
import { uploadToStorage } from "@/lib/mediaUpload";
import * as Haptics from "@/lib/haptics";

type Visibility = "public" | "followers" | "private";

const VISIBILITY_OPTIONS: { key: Visibility; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "public",    label: "Everyone",   icon: "globe-outline" },
  { key: "followers", label: "Followers",  icon: "people-outline" },
  { key: "private",   label: "Only me",    icon: "lock-closed-outline" },
];

export default function CreatePostScreen() {
  const { colors } = useTheme();
  const { user, profile } = useAuth();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ prefill?: string }>();

  const [content, setContent] = useState(params.prefill ?? "");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [showVisibilityPicker, setShowVisibilityPicker] = useState(false);
  const [posting, setPosting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const canPost = content.trim().length > 0 || imageUri != null;

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function handlePost() {
    if (!user || !canPost) return;
    setPosting(true);
    try {
      let uploadedImageUrl: string | null = null;
      if (imageUri) {
        setUploading(true);
        const ext = imageUri.split(".").pop()?.split("?")[0]?.toLowerCase() ?? "jpg";
        const fileName = `post-${user.id}-${Date.now()}.${ext}`;
        const { publicUrl, error: uploadErr } = await uploadToStorage(
          "post-images",
          `${user.id}/${fileName}`,
          imageUri,
          `image/${ext === "png" ? "png" : "jpeg"}`
        );
        setUploading(false);
        if (uploadErr) throw new Error(uploadErr);
        uploadedImageUrl = publicUrl;
      }

      const { error } = await supabase.from("posts").insert({
        author_id: user.id,
        content: content.trim() || null,
        image_url: uploadedImageUrl,
        post_type: "post",
        visibility,
      });

      if (error) throw error;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (router.canGoBack()) router.back(); else router.replace("/(tabs)/discover" as any);
    } catch (err: any) {
      showAlert("Error", err?.message ?? "Could not publish. Please try again.");
    } finally {
      setPosting(false);
      setUploading(false);
    }
  }

  const visOpt = VISIBILITY_OPTIONS.find(v => v.key === visibility)!;

  return (
    <KeyboardAvoidingView
      style={[s.root, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[s.header, { backgroundColor: colors.surface, paddingTop: insets.top + 4, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={s.headerBtn}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.headerTitle, { color: colors.text }]}>New Post</Text>
        <TouchableOpacity
          style={[s.postBtn, (!canPost || posting) && { opacity: 0.45 }]}
          onPress={handlePost}
          disabled={!canPost || posting}
          activeOpacity={0.75}
        >
          {posting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.postBtnText}>Post</Text>}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.body, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Author row */}
        <View style={s.authorRow}>
          <Avatar uri={profile?.avatar_url} name={profile?.display_name ?? "U"} size={42} />
          <View style={s.authorMeta}>
            <Text style={[s.authorName, { color: colors.text }]}>{profile?.display_name}</Text>
            <TouchableOpacity
              style={[s.visibilityBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={() => setShowVisibilityPicker(!showVisibilityPicker)}
              activeOpacity={0.7}
            >
              <Ionicons name={visOpt.icon} size={12} color={colors.textMuted} />
              <Text style={[s.visibilityLabel, { color: colors.textMuted }]}>{visOpt.label}</Text>
              <Ionicons name="chevron-down" size={11} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Visibility picker */}
        {showVisibilityPicker && (
          <View style={[s.visPicker, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {VISIBILITY_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[s.visOption, visibility === opt.key && { backgroundColor: colors.accent + "22" }]}
                onPress={() => { setVisibility(opt.key); setShowVisibilityPicker(false); }}
                activeOpacity={0.7}
              >
                <Ionicons name={opt.icon} size={16} color={visibility === opt.key ? colors.accent : colors.textMuted} />
                <Text style={[s.visOptionText, { color: visibility === opt.key ? colors.accent : colors.text }]}>{opt.label}</Text>
                {visibility === opt.key && <Ionicons name="checkmark" size={14} color={colors.accent} style={{ marginLeft: "auto" }} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Text input */}
        <TextInput
          style={[s.input, { color: colors.text }]}
          placeholder="What's on your mind?"
          placeholderTextColor={colors.textMuted}
          value={content}
          onChangeText={setContent}
          multiline
          autoFocus={!params.prefill}
          textAlignVertical="top"
        />

        {/* Image preview */}
        {imageUri && (
          <View style={s.imageWrap}>
            <Image source={{ uri: imageUri }} style={s.imagePreview} resizeMode="cover" />
            <TouchableOpacity style={s.removeImage} onPress={() => setImageUri(null)} hitSlop={8}>
              <Ionicons name="close-circle" size={24} color="#fff" />
            </TouchableOpacity>
            {uploading && (
              <View style={s.uploadOverlay}>
                <ActivityIndicator color="#fff" />
                <Text style={s.uploadingText}>Uploading…</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom toolbar */}
      <View style={[s.toolbar, { backgroundColor: colors.surface, borderTopColor: colors.border, paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={s.toolbarBtn} onPress={pickImage} hitSlop={8}>
          <Ionicons name="image-outline" size={24} color={colors.accent} />
          <Text style={[s.toolbarLabel, { color: colors.textMuted }]}>Photo</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <Text style={[s.charCount, { color: content.length > 500 ? "#FF3B30" : colors.textMuted }]}>
          {content.length}/500
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    
  },
  headerBtn: { width: 36, alignItems: "flex-start" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600" },
  postBtn: {
    backgroundColor: "#1f95ff",
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 60,
    alignItems: "center",
  },
  postBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  body: { paddingHorizontal: 16, paddingTop: 16, gap: 12 },
  authorRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  authorMeta: { gap: 6 },
  authorName: { fontWeight: "600", fontSize: 15 },
  visibilityBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 0.5,
    alignSelf: "flex-start",
  },
  visibilityLabel: { fontSize: 12, fontWeight: "500" },
  visPicker: {
    borderRadius: 12,
    borderWidth: 0.5,
    overflow: "hidden",
    marginLeft: 54,
  },
  visOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  visOptionText: { fontSize: 14, fontWeight: "500" },
  input: {
    fontSize: 16,
    lineHeight: 24,
    minHeight: 120,
    paddingTop: 4,
  },
  imageWrap: { borderRadius: 12, overflow: "hidden", position: "relative" },
  imagePreview: { width: "100%", height: 220, borderRadius: 12 },
  removeImage: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  uploadingText: { color: "#fff", fontSize: 13 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    
    gap: 8,
  },
  toolbarBtn: { flexDirection: "row", alignItems: "center", gap: 6, padding: 4 },
  toolbarLabel: { fontSize: 13 },
  charCount: { fontSize: 12 },
});
