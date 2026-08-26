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
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import * as Network from "expo-network";
import * as Sharing from "expo-sharing";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useTheme } from "@/hooks/useTheme";
import {
  getPermissionStatus,
  requestPermission,
  type PermissionStatus,
} from "@/lib/permissionsManager";

type FileType = "image" | "video" | "audio" | "document";
type Filter = "all" | FileType;

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

const FILES_KEY = "device_file_manager_files_v1";
const FILES_DIR = `${FileSystem.documentDirectory ?? ""}afuchat_files/`;

function formatBytes(bytes: number): string {
  if (!bytes) return "Size unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getFileType(name: string, mimeType?: string): FileType {
  const mime = (mimeType ?? "").toLowerCase();
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(extension)) return "image";
  if (mime.startsWith("video/") || ["mp4", "mov", "mkv", "webm"].includes(extension)) return "video";
  if (mime.startsWith("audio/") || ["mp3", "m4a", "wav", "aac", "flac", "ogg"].includes(extension)) return "audio";
  return "document";
}

function typeIcon(type: FileType): keyof typeof Ionicons.glyphMap {
  if (type === "image") return "image-outline";
  if (type === "video") return "videocam-outline";
  if (type === "audio") return "musical-notes-outline";
  return "document-text-outline";
}

function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\\.+/, "");
  return cleaned || `file_${Date.now()}`;
}

function permissionLabel(status: PermissionStatus): string {
  if (status === "granted") return "Ready";
  if (status === "blocked") return "Open Settings";
  if (Platform.OS === "ios" && status === "undetermined") return "Handled by iOS";
  return "Enable";
}

export default function FileManagerScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [galleryFiles, setGalleryFiles] = useState<FileItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [galleryPermission, setGalleryPermission] = useState<"checking" | "granted" | "denied">("checking");
  const [galleryCanAskAgain, setGalleryCanAskAgain] = useState(true);
  const [importing, setImporting] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [networkLabel, setNetworkLabel] = useState("Checking connection…");
  const [ipAddress, setIpAddress] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<TransferPermissions>({
    bluetooth: getPermissionStatus("bluetooth"),
    wifi: getPermissionStatus("wifi"),
    location: getPermissionStatus("location"),
  });

  const loadFiles = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(FILES_KEY);
      if (raw) setFiles(JSON.parse(raw) as FileItem[]);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

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

  const persistFiles = useCallback(async (next: FileItem[]) => {
    setFiles(next);
    await AsyncStorage.setItem(FILES_KEY, JSON.stringify(next));
  }, []);

  const importFiles = useCallback(async () => {
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      await FileSystem.makeDirectoryAsync(FILES_DIR, { intermediates: true });

      const imported: FileItem[] = [];
      for (const asset of result.assets) {
        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const destination = `${FILES_DIR}${id}_${safeFileName(asset.name)}`;
        await FileSystem.copyAsync({ from: asset.uri, to: destination });
        imported.push({
          id,
          name: asset.name,
          size: asset.size ?? 0,
          type: getFileType(asset.name, asset.mimeType),
          mimeType: asset.mimeType,
          uri: destination,
          addedAt: new Date().toISOString(),
          isGallery: false,
        });
      }
      await persistFiles([...imported, ...files]);
      if (imported[0]) setSelectedId(imported[0].id);
    } catch {
      Alert.alert("Could not add files", "The selected file could not be copied into AfuChat storage.");
    } finally {
      setImporting(false);
    }
  }, [files, persistFiles]);

  const removeFile = useCallback(async (item: FileItem) => {
    try {
      await FileSystem.deleteAsync(item.uri, { idempotent: true });
    } catch {
      // The metadata should still be removable if the OS already removed the file.
    }
    await persistFiles(files.filter((file) => file.id !== item.id));
    if (selectedId === item.id) setSelectedId(null);
  }, [files, persistFiles, selectedId]);

  const filteredFiles = useMemo(
    () => {
      const combined = [...galleryFiles, ...files];
      return (filter === "all" ? combined : combined.filter((file) => file.type === filter))
        .sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    },
    [files, filter, galleryFiles],
  );
  const selectedFile = filteredFiles.find((file) => file.id === selectedId) ?? filteredFiles[0];
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  const openTransfer = useCallback(async () => {
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

  const enableNearbyAccess = useCallback(async () => {
    setTransferLoading(true);
    try {
      const [bluetooth, wifi, location] = await Promise.all([
        requestPermission("bluetooth"),
        requestPermission("wifi"),
        requestPermission("location"),
      ]);
      setPermissions({ bluetooth, wifi, location });
    } finally {
      setTransferLoading(false);
    }
  }, []);

  const shareSelectedFile = useCallback(async () => {
    if (!selectedFile) {
      Alert.alert("Choose a file first", "Add a file from your device, then select it to send.");
      return;
    }
    try {
      const available = await Sharing.isAvailableAsync();
      if (!available) {
        Alert.alert("Sharing is unavailable", "This device does not expose a system file-sharing sheet.");
        return;
      }
      await Sharing.shareAsync(selectedFile.uri, {
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
        right={
          <Pressable
            testID="file-manager-transfer"
            accessibilityRole="button"
            accessibilityLabel="Open offline transfer"
            onPress={openTransfer}
            style={styles.headerButton}
          >
            <Ionicons name="paper-plane-outline" size={21} color={colors.accent} />
          </Pressable>
        }
      />

      <View style={[styles.summary, { backgroundColor: colors.surface }]}>
        <View style={[styles.summaryIcon, { backgroundColor: colors.accent + "18" }]}>
          <Ionicons name="folder-open-outline" size={25} color={colors.accent} />
        </View>
        <View style={styles.summaryCopy}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>On this device</Text>
          <Text style={[styles.summaryMeta, { color: colors.textMuted }]}>
            {galleryFiles.length + files.length} {galleryFiles.length + files.length === 1 ? "file" : "files"}
            {totalSize ? ` · ${formatBytes(totalSize)} stored` : " · Phone gallery included"}
          </Text>
        </View>
        <Pressable
          testID="file-manager-import"
          accessibilityRole="button"
          accessibilityLabel="Browse device files"
          onPress={importFiles}
          disabled={importing}
          style={[styles.importButton, { backgroundColor: colors.accent }]}
        >
          {importing ? <ActivityIndicator size="small" color={colors.background} /> : <Ionicons name="add" size={20} color={colors.background} />}
          <Text style={[styles.importLabel, { color: colors.background }]}>Add documents</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {(["all", "image", "video", "audio", "document"] as Filter[]).map((value) => {
          const active = filter === value;
          return (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.filter, { backgroundColor: active ? colors.accent : colors.surface }]}
            >
              <Text style={[styles.filterText, { color: active ? colors.background : colors.textMuted }]}>
                {value === "all" ? "All files" : `${value[0].toUpperCase()}${value.slice(1)}s`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {galleryPermission !== "granted" && (
        <View style={[styles.galleryAccessCard, { backgroundColor: colors.surface }]}>
          <View style={[styles.galleryAccessIcon, { backgroundColor: colors.accent + "18" }]}>
            <Ionicons name="images-outline" size={23} color={colors.accent} />
          </View>
          <View style={styles.galleryAccessCopy}>
            <Text style={[styles.galleryAccessTitle, { color: colors.text }]}>Show your phone gallery</Text>
            <Text style={[styles.galleryAccessDesc, { color: colors.textMuted }]}>
              Allow AfuChat to display photos and videos already on this device. Nothing is uploaded.
            </Text>
          </View>
          <Pressable
            testID="file-manager-gallery-permission"
            accessibilityRole="button"
            onPress={requestGalleryAccess}
            style={[styles.galleryAccessButton, { backgroundColor: colors.accent }]}
          >
            {galleryLoading ? <ActivityIndicator size="small" color={colors.background} /> : (
              <Text style={[styles.galleryAccessButtonText, { color: colors.background }]}>
                {galleryPermission === "checking" ? "Checking" : galleryCanAskAgain ? "Allow" : "Settings"}
              </Text>
            )}
          </Pressable>
        </View>
      )}

      {loading || (galleryLoading && galleryPermission === "checking") ? (
        <View style={styles.center}><ActivityIndicator color={colors.accent} /></View>
      ) : filteredFiles.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name={galleryPermission === "granted" ? "images-outline" : "folder-open-outline"} size={52} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {galleryPermission !== "granted"
              ? "Gallery access is needed"
              : files.length === 0 && galleryFiles.length === 0
                ? "Your device gallery is empty"
                : "No files in this filter"}
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.textMuted }]}>
            {galleryPermission !== "granted"
              ? "Use the button above to show the photos and videos already saved on your phone."
              : files.length === 0 && galleryFiles.length === 0
                ? "Photos and videos from your phone will appear here. You can also add documents separately."
                : "Choose another category or add a document from the device."}
          </Text>
          {galleryPermission !== "granted" ? (
            <Pressable onPress={requestGalleryAccess} style={[styles.emptyAction, { backgroundColor: colors.accent }]}>
              <Ionicons name="images-outline" size={18} color={colors.background} />
              <Text style={[styles.emptyActionText, { color: colors.background }]}>Allow gallery access</Text>
            </Pressable>
          ) : files.length === 0 && galleryFiles.length === 0 ? (
            <Pressable onPress={importFiles} style={[styles.emptyAction, { backgroundColor: colors.accent }]}>
              <Ionicons name="folder-open-outline" size={18} color={colors.background} />
              <Text style={[styles.emptyActionText, { color: colors.background }]}>Add a document</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <FlatList
          data={filteredFiles}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 28, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const selected = selectedId === item.id;
            return (
              <Pressable
                testID={`file-row-${item.id}`}
                onPress={() => setSelectedId(selected ? null : item.id)}
                onLongPress={item.isGallery ? undefined : () => Alert.alert(item.name, "Remove this local copy?", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => removeFile(item) },
                ])}
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
                    {item.isGallery ? "Phone gallery" : item.type} · {item.size ? formatBytes(item.size) : "Size unavailable"}
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

      {selectedFile && (
        <Pressable
          testID="file-manager-send"
          accessibilityRole="button"
          accessibilityLabel={`Send ${selectedFile.name} offline`}
          onPress={shareSelectedFile}
          style={[styles.sendBar, { backgroundColor: colors.accent, bottom: insets.bottom + 14 }]}
        >
          <Ionicons name="paper-plane" size={19} color={colors.background} />
          <Text style={[styles.sendBarText, { color: colors.background }]}>Send offline</Text>
          <Text style={[styles.sendBarHint, { color: colors.background + "BB" }]}>Bluetooth · Wi-Fi</Text>
        </Pressable>
      )}

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
              Android and iOS show the system share sheet here. Choose Bluetooth, Quick Share, AirDrop, or another nearby device option; the file stays on-device and does not need AfuChat’s servers.
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  summary: { flexDirection: "row", alignItems: "center", margin: 16, marginBottom: 10, padding: 14, borderRadius: 18, gap: 12 },
  summaryIcon: { width: 48, height: 48, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  summaryCopy: { flex: 1 },
  summaryTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  summaryMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  importButton: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 10 },
  importLabel: { fontSize: 12, fontFamily: "Inter_700Bold" },
  filters: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, alignItems: "center" },
  filter: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99 },
  filterText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  emptyDesc: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyAction: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 12, paddingHorizontal: 15, paddingVertical: 11, marginTop: 4 },
  emptyActionText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  fileRow: { minHeight: 72, marginHorizontal: 12, marginBottom: 8, paddingHorizontal: 14, borderRadius: 16, flexDirection: "row", alignItems: "center", gap: 13 },
  galleryAccessCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8, padding: 12, borderRadius: 16, gap: 10 },
  galleryAccessIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  galleryAccessCopy: { flex: 1 },
  galleryAccessTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  galleryAccessDesc: { fontSize: 11, lineHeight: 15, fontFamily: "Inter_400Regular", marginTop: 2 },
  galleryAccessButton: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  galleryAccessButtonText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  thumbnail: { width: 48, height: 48, borderRadius: 13, backgroundColor: "rgba(128,128,128,0.15)" },
  fileIcon: { width: 43, height: 43, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  fileCopy: { flex: 1 },
  fileName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  fileMeta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  sendBar: { position: "absolute", left: 16, right: 16, minHeight: 52, borderRadius: 17, flexDirection: "row", alignItems: "center", paddingHorizontal: 17, gap: 9 },
  sendBarText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  sendBarHint: { marginLeft: "auto", fontSize: 11, fontFamily: "Inter_500Medium" },
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