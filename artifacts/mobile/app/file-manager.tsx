import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as MediaLibrary from "expo-media-library";
import * as Network from "expo-network";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/context/LanguageContext";
import {
  getPermissionStatus,
  requestPermission,
  type PermissionStatus,
} from "@/lib/permissionsManager";

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

type TransferPermissions = {
  bluetooth: PermissionStatus;
  wifi: PermissionStatus;
  location: PermissionStatus;
};

type NativeSharingModule = typeof import("expo-sharing");

function getNativeSharing(): NativeSharingModule | null {
  if (Platform.OS === "web") return null;
  try {
    return require("expo-sharing") as NativeSharingModule;
  } catch {
    return null;
  }
}

function typeIcon(type: FileType): keyof typeof Ionicons.glyphMap {
  if (type === "image") return "image-outline";
  if (type === "video") return "videocam-outline";
  if (type === "audio") return "musical-notes-outline";
  return "document-text-outline";
}

function permissionLabel(status: PermissionStatus): string {
  if (status === "granted") return "Ready";
  if (status === "blocked") return "Open Settings";
  if (Platform.OS === "ios" && status === "undetermined") return "Handled by iOS";
  return "Enable";
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
  const { colors, isDark } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8) + 6;
  const activeColor = colors.accent;
  const inactiveColor = isDark ? "rgba(255,255,255,0.52)" : "rgba(0,0,0,0.42)";

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
          const color = active ? colors.background : inactiveColor;
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
                <Ionicons name={item.icon} size={20} color={color} />
              </View>
              <Text style={[styles.fmNavLabel, { color }]} numberOfLines={1}>
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
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [galleryFiles, setGalleryFiles] = useState<FileItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryPermission, setGalleryPermission] = useState<"checking" | "granted" | "denied">("checking");
  const [galleryCanAskAgain, setGalleryCanAskAgain] = useState(true);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [networkLabel, setNetworkLabel] = useState("Checking connection…");
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<TransferPermissions>({
    bluetooth: getPermissionStatus("bluetooth"),
    wifi: getPermissionStatus("wifi"),
    location: getPermissionStatus("location"),
  });

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
        size: 0,
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

  const openTransfer = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Native sharing only",
        "Open AfuChat on an Android or iOS device to share with paired devices.",
      );
      return;
    }
    setTransferOpen(true);
    setTransferLoading(true);
    try {
      const [state, address] = await Promise.all([
        Network.getNetworkStateAsync(),
        Network.getIpAddressAsync().catch(() => null),
      ]);
      setNetworkLabel(state.type === Network.NetworkStateType.WIFI ? "Wi-Fi connected" : state.isConnected ? "Connected, not Wi-Fi" : "Offline");
      setIpAddress(address);
    } catch {
      setNetworkLabel("Network status unavailable");
      setIpAddress(null);
    } finally {
      setTransferLoading(false);
    }
  }, []);

  const shareSelectedFile = useCallback(async () => {
    if (Platform.OS === "web") {
      Alert.alert(
        "Native sharing only",
        "Paired-device sharing is available in the Android and iOS app.",
      );
      return;
    }
    if (!selectedFile) {
      Alert.alert("Choose a file first", "Add a file from your device, then select it to send.");
      return;
    }
    const sharing = getNativeSharing();
    const localUri = selectedFile.uri.trim();
    if (!sharing || !/^(?:file|content|ph):\/\//i.test(localUri)) {
      Alert.alert(
        "Native sharing is unavailable",
        "This file is not available as a local native file. Choose a file from your device and try again.",
      );
      return;
    }
    try {
      const available = await sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Sharing is unavailable", "This device does not expose a system file-sharing sheet.");
        return;
      }
      await sharing.shareAsync(localUri, {
        dialogTitle: `Send ${selectedFile.name}`,
        mimeType: selectedFile.mimeType ?? "application/octet-stream",
        UTI: selectedFile.mimeType ?? "public.data",
      });
    } catch {
      // Cancelling the native share sheet is not an error to surface.
    }
  }, [selectedFile]);

  const handlePermissionAction = useCallback(async (type: keyof TransferPermissions) => {
    if (permissions[type] === "blocked") {
      if (Platform.OS !== "web") await Linking.openSettings();
      return;
    }
    const status = await requestPermission(type);
    setPermissions((current) => ({ ...current, [type]: status }));
  }, [permissions]);

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
          onPress={shareSelectedFile}
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
          <Text style={[styles.sendBarHint, { color: colors.background + "BB" }]}>Bluetooth · Wi-Fi</Text>
        </Pressable>
      )}

      <FileManagerBottomNav
        filter={filter}
        transferOpen={transferOpen}
        onFilterChange={setFilter}
        onTransfer={openTransfer}
      />

      <Modal visible={transferOpen} transparent animationType="slide" onRequestClose={() => setTransferOpen(false)}>
        <View style={[styles.modalBackdrop, { backgroundColor: isDark ? "rgba(0,0,0,0.72)" : "rgba(0,0,0,0.38)" }]}>
          <View style={[styles.transferSheet, { backgroundColor: colors.background }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Offline transfer</Text>
                <Text style={[styles.sheetSubtitle, { color: colors.textMuted }]}>Use your device’s nearby sharing options</Text>
              </View>
              <Pressable onPress={() => setTransferOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </Pressable>
            </View>

            <View style={[styles.networkCard, { backgroundColor: colors.surface }]}>
              <Ionicons
                name={networkLabel === "Offline" ? "cloud-offline-outline" : "wifi-outline"}
                size={22}
                color={colors.accent}
              />
              <View style={styles.networkCopy}>
                <Text style={[styles.networkTitle, { color: colors.text }]}>{networkLabel}</Text>
                <Text style={[styles.networkMeta, { color: colors.textMuted }]}>
                  {ipAddress ? `Local address ${ipAddress}` : "Internet is not required for nearby sharing"}
                </Text>
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Nearby access</Text>
            {([
              ["bluetooth", "Bluetooth", "Discover nearby devices and send through Bluetooth or Nearby Share", "bluetooth-outline"],
              ["wifi", "Wi-Fi nearby", "Allow local Wi-Fi discovery for faster offline sharing", "wifi-outline"],
              ["location", "GPS / location", "Required by older Android versions for Bluetooth and Wi-Fi discovery", "location-outline"],
            ] as const).map(([type, title, description, icon]) => (
              <View key={type} style={[styles.permissionRow, { backgroundColor: colors.surface }]}>
                <View style={[styles.permissionIcon, { backgroundColor: colors.accent + "18" }]}>
                  <Ionicons name={icon} size={20} color={colors.accent} />
                </View>
                <View style={styles.permissionCopy}>
                  <Text style={[styles.permissionTitle, { color: colors.text }]}>{title}</Text>
                  <Text style={[styles.permissionDesc, { color: colors.textMuted }]} numberOfLines={2}>{description}</Text>
                </View>
                <Pressable
                  onPress={() => handlePermissionAction(type)}
                  style={[styles.permissionButton, { borderColor: colors.accent }]}
                >
                  <Text style={[styles.permissionButtonText, { color: colors.accent }]}>{permissionLabel(permissions[type])}</Text>
                </Pressable>
              </View>
            ))}

            <Pressable
              testID="file-manager-share-nearby"
              onPress={shareSelectedFile}
              disabled={transferLoading || !selectedFile}
              style={[styles.nearbyButton, { backgroundColor: colors.accent, opacity: transferLoading || !selectedFile ? 0.55 : 1 }]}
            >
              {transferLoading ? <ActivityIndicator color={colors.background} /> : <Ionicons name="paper-plane-outline" size={20} color={colors.background} />}
              <Text style={[styles.nearbyButtonText, { color: colors.background }]}>
                {selectedFile ? `Send ${selectedFile.name}` : "Select a file to send"}
              </Text>
            </Pressable>
            <Text style={[styles.transferNote, { color: colors.textMuted }]}>
              AfuChat uses the native Android or iOS share sheet only. Choose a paired device through Quick Share, AirDrop, Bluetooth, or another nearby option. The local file never passes through AfuChat’s servers; the operating system handles the encrypted device-to-device handoff.
            </Text>
          </View>
        </View>
      </Modal>
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
  modalBackdrop: { flex: 1, justifyContent: "flex-end" },
  transferSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 26 },
  sheetHandle: { width: 38, height: 4, borderRadius: 99, backgroundColor: "rgba(128,128,128,0.35)", alignSelf: "center", marginBottom: 16 },
  sheetHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 },
  sheetTitle: { fontSize: 22, fontFamily: "Inter_700Bold" },
  sheetSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  networkCard: { flexDirection: "row", alignItems: "center", padding: 13, borderRadius: 16, gap: 11, marginBottom: 18 },
  networkCopy: { flex: 1 },
  networkTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  networkMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 },
  permissionRow: { minHeight: 68, borderRadius: 15, padding: 10, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 7 },
  permissionIcon: { width: 37, height: 37, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  permissionCopy: { flex: 1 },
  permissionTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  permissionDesc: { fontSize: 10.5, lineHeight: 14, fontFamily: "Inter_400Regular", marginTop: 2 },
  permissionButton: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7 },
  permissionButtonText: { fontSize: 10.5, fontFamily: "Inter_700Bold" },
  nearbyButton: { minHeight: 51, borderRadius: 15, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, marginTop: 10 },
  nearbyButtonText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  transferNote: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 11, paddingHorizontal: 8 },
});