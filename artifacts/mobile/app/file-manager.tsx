import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import { GlassHeader } from "@/components/ui/GlassHeader";
import NearbyTransferSheet from "@/components/nearby/NearbyTransferSheet";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/context/LanguageContext";

type FileType = "image" | "video" | "audio" | "document";
type Filter = "all" | "image" | "video" | "audio";

type FileItem = {
  id: string;
  name: string;
  size: number;
  type: FileType;
  mimeType?: string;
  uri: string;
  addedAt: string;
  isGallery: boolean;
};

function typeIcon(type: FileType): keyof typeof Ionicons.glyphMap {
  if (type === "image") return "image-outline";
  if (type === "video") return "videocam-outline";
  if (type === "audio") return "musical-notes-outline";
  return "document-text-outline";
}

function FileManagerBottomNav({
  filter,
  transferOpen,
  onFilterChange,
  onTransfer,
}: {
  filter: Filter;
  transferOpen: boolean;
  onFilterChange: (filter: Filter) => void;
  onTransfer: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8) + 6;
  const activeColor = colors.accent;
  const inactiveColor = colors.textSecondary;

  const items: Array<{
    key: Filter | "transfer";
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }> = [
    { key: "all", label: "Library", icon: "folder" },
    { key: "image", label: "Images", icon: "images" },
    { key: "video", label: "Videos", icon: "videocam" },
    { key: "audio", label: "Audio", icon: "musical-notes" },
    { key: "transfer", label: "Transfer", icon: "swap-horizontal" },
  ];

  return (
    <View style={[styles.fmNavWrap, { bottom }]}>
      <View
        style={[
          styles.fmNav,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        {items.map((item) => {
          const active = item.key === "transfer"
            ? transferOpen
            : !transferOpen && filter === item.key;
          const iconColor = active ? colors.bubbleText : inactiveColor;
          const labelColor = active ? activeColor : inactiveColor;
          return (
            <Pressable
              key={item.key}
              testID={`file-manager-nav-${item.key}`}
              accessibilityRole="button"
              accessibilityLabel={t(item.label)}
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (item.key === "transfer") {
                  onTransfer();
                } else {
                  onFilterChange(item.key);
                }
              }}
              style={styles.fmNavTab}
            >
              <View style={styles.fmNavIcon}>
                {active && (
                  <View
                    style={[
                      styles.fmNavActiveOval,
                      { backgroundColor: activeColor, pointerEvents: "none" },
                    ]}
                  />
                )}
                <Ionicons name={item.icon} size={21} color={iconColor} />
              </View>
              <Text style={[styles.fmNavLabel, { color: labelColor }]} numberOfLines={1}>
                {t(item.label)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function FileManagerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [galleryFiles, setGalleryFiles] = useState<FileItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryPermission, setGalleryPermission] = useState<"checking" | "granted" | "denied">("checking");
  const [galleryCanAskAgain, setGalleryCanAskAgain] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);

  const loadGallery = useCallback(async (activeFilter: Filter = filter) => {
    if (Platform.OS === "web") {
      setGalleryPermission("denied");
      setGalleryLoading(false);
      return;
    }
    setGalleryLoading(true);
    try {
      const current = await MediaLibrary.getPermissionsAsync();
      const hasAccess = current.granted || current.status === "granted";
      setGalleryCanAskAgain(current.canAskAgain !== false);
      if (!hasAccess) {
        setGalleryPermission("denied");
        setGalleryFiles([]);
        return;
      }

      const mediaType = activeFilter === "image"
        ? [MediaLibrary.MediaType.photo]
        : activeFilter === "video"
          ? [MediaLibrary.MediaType.video]
          : activeFilter === "audio"
            ? [MediaLibrary.MediaType.audio]
            : [MediaLibrary.MediaType.photo, MediaLibrary.MediaType.video];
      const result = await MediaLibrary.getAssetsAsync({
        mediaType,
        first: 300,
        sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      });
      setGalleryFiles(result.assets.map((asset) => ({
        id: `gallery-${asset.id}`,
        name: asset.filename || `${asset.mediaType}-${asset.id}`,
        size: Number((asset as any).fileSize) || 0,
        type: asset.mediaType === MediaLibrary.MediaType.photo
          ? "image"
          : asset.mediaType === MediaLibrary.MediaType.video
            ? "video"
            : "audio",
        mimeType: asset.mediaType === MediaLibrary.MediaType.photo
          ? "image/*"
          : asset.mediaType === MediaLibrary.MediaType.video
            ? "video/*"
            : "audio/*",
        uri: asset.uri,
        addedAt: new Date(asset.creationTime || Date.now()).toISOString(),
        isGallery: true,
      })));
      setGalleryPermission("granted");
    } catch {
      setGalleryPermission("denied");
      setGalleryFiles([]);
    } finally {
      setGalleryLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadGallery(filter);
  }, [filter, loadGallery]);

  const requestGalleryAccess = useCallback(async () => {
    if (galleryPermission === "denied" && !galleryCanAskAgain && Platform.OS !== "web") {
      await Linking.openSettings();
      return;
    }
    setGalleryLoading(true);
    try {
      const result = await MediaLibrary.requestPermissionsAsync();
      setGalleryCanAskAgain(result.canAskAgain !== false);
      if (result.granted || result.status === "granted") {
        setGalleryPermission("granted");
        await loadGallery(filter);
      } else {
        setGalleryPermission("denied");
      }
    } catch {
      setGalleryPermission("denied");
    } finally {
      setGalleryLoading(false);
    }
  }, [filter, galleryCanAskAgain, galleryPermission, loadGallery]);

  const filteredFiles = useMemo(
    () => galleryFiles.slice().sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
    [galleryFiles],
  );
  const selectedFile = filteredFiles.find((file) => file.id === selectedId) ?? filteredFiles[0];

  const openTransfer = useCallback(() => {
    setTransferOpen(true);
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.backgroundSecondary }]}>
      <GlassHeader
        title="File Manager"
        glassBackButton
        style={styles.header}
      />

      {galleryLoading && galleryPermission === "checking" ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : filteredFiles.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name={galleryPermission === "granted" ? "images-outline" : "folder-open-outline"} size={52} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {galleryPermission !== "granted"
              ? "Gallery access is needed"
              : galleryFiles.length === 0
                ? "Your device gallery is empty"
                : "No files in this filter"}
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
            {galleryPermission !== "granted"
              ? "Use the button below to show the photos and videos already saved on your phone."
              : galleryFiles.length === 0
                ? "Photos and videos from your phone will appear here."
                : "Choose another category to browse your phone gallery."}
          </Text>
          {galleryPermission !== "granted" ? (
            <Pressable onPress={requestGalleryAccess} style={[styles.emptyAction, { backgroundColor: colors.accent }]}>
              <Ionicons name="images-outline" size={18} color={colors.background} />
              <Text style={[styles.emptyActionText, { color: colors.background }]}>Allow gallery access</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={filteredFiles}
          keyExtractor={(item) => item.id}
           contentContainerStyle={{ paddingBottom: insets.bottom + 132, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
           removeClippedSubviews={false}
          renderItem={({ item }) => {
            const selected = selectedId === item.id;
            return (
              <Pressable
                testID={`file-row-${item.id}`}
                onPress={() => setSelectedId(selected ? null : item.id)}
                style={[styles.fileRow, { backgroundColor: colors.surface }, selected && { borderColor: colors.accent, borderWidth: 1 }]}
              >
                {item.type === "image" ? (
                  <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                ) : (
                  <View style={[styles.fileIcon, { backgroundColor: colors.accent + "18" }]}>
                    <Ionicons name={typeIcon(item.type)} size={22} color={colors.accent} />
                  </View>
                )}
                <View style={styles.fileCopy}>
                  <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.fileMeta, { color: colors.textMuted }]}>
                    {item.type} · Phone gallery
                  </Text>
                </View>
                {selected ? (
                  <Ionicons name="checkmark-circle" size={23} color={colors.accent} />
                ) : (
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
                )}
              </Pressable>
            );
          }}
        />
      )}

      {Platform.OS !== "web" && selectedFile && (
        <Pressable
          testID="file-manager-send"
          accessibilityRole="button"
          accessibilityLabel={`Send ${selectedFile.name} offline`}
          onPress={openTransfer}
           style={[
             styles.sendBar,
             {
               backgroundColor: colors.accent,
               bottom: Math.max(insets.bottom, 8) + 76,
             },
           ]}
        >
          <Ionicons name="paper-plane" size={19} color={colors.background} />
          <Text style={[styles.sendBarText, { color: colors.background }]}>Send offline</Text>
          <Text style={[styles.sendBarHint, { color: colors.background + "BB" }]}>Direct Wi-Fi</Text>
        </Pressable>
      )}

      <FileManagerBottomNav
        filter={filter}
        transferOpen={transferOpen}
        onFilterChange={setFilter}
        onTransfer={openTransfer}
      />

      <NearbyTransferSheet
        visible={transferOpen}
        file={selectedFile ? {
          uri: selectedFile.uri,
          name: selectedFile.name,
          size: selectedFile.size,
          mimeType: selectedFile.mimeType,
        } : null}
        onClose={() => setTransferOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { borderBottomWidth: 0 },
  summary: { flexDirection: "row", alignItems: "center", margin: 16, marginBottom: 10, padding: 14, borderRadius: 18, gap: 12 },
  summaryIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  summaryCopy: { flex: 1 },
  summaryTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  summaryMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyAction: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11, marginTop: 4 },
  emptyActionText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  fileRow: { minHeight: 72, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 14, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 13 },
  thumbnail: { width: 48, height: 48, borderRadius: 13, backgroundColor: "rgba(128,128,128,0.15)" },
  fileIcon: { width: 43, height: 43, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  fileCopy: { flex: 1 },
  fileName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fileMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  sendBar: { position: "absolute", left: 16, right: 16, minHeight: 52, borderRadius: 17, flexDirection: "row", alignItems: "center", paddingHorizontal: 17, gap: 9 },
  sendBarText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  sendBarHint: { marginLeft: "auto", fontSize: 11, fontFamily: "Inter_500Medium" },
  fmNavWrap: { position: "absolute", left: 20, right: 20, zIndex: 100, alignItems: "center" },
  fmNav: { height: 56, width: "100%", borderRadius: 999, borderWidth: 1, paddingHorizontal: 6, flexDirection: "row", alignItems: "center", overflow: "hidden" },
  fmNavTab: { flex: 1, minWidth: 0, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  fmNavIcon: { width: 44, height: 30, alignItems: "center", justifyContent: "center", position: "relative" },
  fmNavActiveOval: { ...StyleSheet.absoluteFillObject, borderRadius: 9999 },
  fmNavLabel: { width: "100%", fontSize: 9, lineHeight: 10, fontFamily: "Inter_700Bold", fontWeight: "700", textAlign: "center", marginTop: 0, includeFontPadding: false },
});