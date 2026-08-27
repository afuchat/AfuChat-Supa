import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as MediaLibrary from "expo-media-library";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "@/components/ui/SafeGradient";
import { GlassHeader } from "@/components/ui/GlassHeader";
import { useTheme } from "@/hooks/useTheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showAlert } from "@/lib/alert";

type LocalTrack = {
  id: string;
  uri: string;
  filename: string;
  duration: number;
};

type PlaybackStatusLike = {
  isLoaded: boolean;
  isPlaying?: boolean;
  positionMillis?: number;
  durationMillis?: number;
  didJustFinish?: boolean;
};

type PlaybackSound = {
  playAsync: () => Promise<unknown>;
  pauseAsync: () => Promise<unknown>;
  unloadAsync: () => Promise<unknown>;
  getStatusAsync: () => Promise<PlaybackStatusLike>;
  setPositionAsync: (positionMillis: number) => Promise<unknown>;
};

function getAudioModule(): typeof import("expo-av").Audio | null {
  if (Platform.OS === "web") return null;
  try {
    return require("expo-av").Audio;
  } catch {
    return null;
  }
}

function displayName(filename: string): string {
  return filename.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled track";
}

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function NativeOnlyState({ colors, accent }: { colors: any; accent: string }) {
  return (
    <View style={[styles.centerState, { backgroundColor: colors.background }]}>
      <View style={[styles.emptyIcon, { backgroundColor: accent + "18" }]}>
        <Ionicons name="phone-portrait-outline" size={38} color={accent} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>AfuMusic lives on your phone</Text>
      <Text style={[styles.emptyText, { color: colors.textMuted }]}>
        Open AfuChat on your iPhone or Android device to play the audio files already saved in your
        library. Your music never leaves your device.
      </Text>
    </View>
  );
}

function TrackRow({
  track,
  active,
  playing,
  colors,
  accent,
  onPress,
}: {
  track: LocalTrack;
  active: boolean;
  playing: boolean;
  colors: any;
  accent: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.trackRow,
        { backgroundColor: active ? accent + "12" : colors.surface, opacity: pressed ? 0.7 : 1 },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${playing ? "Pause" : "Play"} ${displayName(track.filename)}`}
      testID={`afumusic-track-${track.id}`}
    >
      <View style={[styles.trackArt, { backgroundColor: active ? accent : colors.backgroundSecondary }]}>
        <Ionicons name={active && playing ? "volume-high" : "musical-note"} size={20} color={active ? "#fff" : accent} />
      </View>
      <View style={styles.trackInfo}>
        <Text style={[styles.trackTitle, { color: colors.text }]} numberOfLines={1}>
          {displayName(track.filename)}
        </Text>
        <Text style={[styles.trackMeta, { color: colors.textMuted }]} numberOfLines={1}>
          On this device · {formatTime(track.duration)}
        </Text>
      </View>
      <View style={[styles.trackAction, { backgroundColor: active ? accent : colors.backgroundSecondary }]}>
        <Ionicons name={active && playing ? "pause" : "play"} size={15} color={active ? "#fff" : accent} />
      </View>
    </Pressable>
  );
}

export default function AfuMusicScreen() {
  const { colors, accent } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = MediaLibrary.usePermissions({
    granularPermissions: ["audio"],
  });
  const [tracks, setTracks] = useState<LocalTrack[]>([]);
  const [loading, setLoading] = useState(Platform.OS !== "web");
  const [error, setError] = useState<string | null>(null);
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const soundRef = useRef<PlaybackSound | null>(null);
  const playRequestRef = useRef(0);
  const mountedRef = useRef(true);

  const loadTracks = useCallback(async () => {
    if (Platform.OS === "web" || !permission?.granted) return;
    setLoading(true);
    setError(null);
    try {
      const result = await MediaLibrary.getAssetsAsync({
        first: 200,
        mediaType: MediaLibrary.MediaType.audio,
        sortBy: MediaLibrary.SortBy.default,
      });
      if (!mountedRef.current) return;
      setTracks(
        result.assets.map((asset) => ({
          id: asset.id,
          uri: asset.uri,
          filename: asset.filename,
          duration: asset.duration ?? 0,
        })),
      );
    } catch {
      if (mountedRef.current) setError("We couldn't read the audio library. Try again.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [permission?.granted]);

  useEffect(() => {
    mountedRef.current = true;
    if (Platform.OS === "web") {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }
    if (permission?.granted) void loadTracks();
    else if (permission && !permission.granted) setLoading(false);

    return () => {
      mountedRef.current = false;
      const sound = soundRef.current;
      soundRef.current = null;
      if (sound) void sound.unloadAsync().catch(() => {});
    };
  }, [permission?.granted, loadTracks]);

  const currentTrack = useMemo(
    () => tracks.find((track) => track.id === currentTrackId) ?? null,
    [tracks, currentTrackId],
  );

  async function handleTrackPress(track: LocalTrack) {
    const Audio = getAudioModule();
    if (!Audio) return;

    try {
      if (currentTrackId === track.id && soundRef.current) {
        const status = await soundRef.current.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await soundRef.current.pauseAsync();
        } else if (status.isLoaded) {
          if (status.didJustFinish) await soundRef.current.setPositionAsync(0);
          await soundRef.current.playAsync();
        }
        return;
      }

      const requestId = ++playRequestRef.current;
      const oldSound = soundRef.current;
      soundRef.current = null;
      if (oldSound) await oldSound.unloadAsync().catch(() => {});

      setCurrentTrackId(track.id);
      setIsPlaying(false);
      setPositionMillis(0);
      setDurationMillis(track.duration * 1000);

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const info = await MediaLibrary.getAssetInfoAsync(track.id, {
        shouldDownloadFromNetwork: false,
      });
      const uri = info.localUri ?? info.uri ?? track.uri;
      const created = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true, progressUpdateIntervalMillis: 500 },
        (status: PlaybackStatusLike) => {
          if (!mountedRef.current || !status.isLoaded) return;
          setIsPlaying(status.didJustFinish ? false : !!status.isPlaying);
          setPositionMillis(status.didJustFinish ? 0 : status.positionMillis ?? 0);
          setDurationMillis(status.durationMillis ?? track.duration * 1000);
        },
      );

      if (requestId !== playRequestRef.current) {
        await (created.sound as PlaybackSound).unloadAsync().catch(() => {});
        return;
      }
      soundRef.current = created.sound as PlaybackSound;
      setIsPlaying(true);
    } catch {
      setIsPlaying(false);
      setError("This track couldn't be played. It may no longer be available offline.");
    }
  }

  function skipTrack(direction: -1 | 1) {
    if (!currentTrackId || tracks.length === 0) return;
    const index = tracks.findIndex((track) => track.id === currentTrackId);
    const next = tracks[(index + direction + tracks.length) % tracks.length];
    if (next) void handleTrackPress(next);
  }

  async function handleGrantAccess() {
    try {
      const result = await requestPermission();
      if (result.granted) void loadTracks();
    } catch {
      showAlert("Music access unavailable", "Please allow AfuChat to access audio in your device settings.");
    }
  }

  function openDeviceSettings() {
    Linking.openSettings().catch(() => {
      showAlert("Open Settings", "Please enable music access for AfuChat in your device settings.");
    });
  }

  if (Platform.OS === "web") {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GlassHeader title="AfuMusic" subtitle="Offline listening" />
        <NativeOnlyState colors={colors} accent={accent} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <GlassHeader
        title="AfuMusic"
        subtitle="Offline listening"
        right={
          <Pressable
            onPress={() => void loadTracks()}
            disabled={loading || !permission?.granted}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Refresh music library"
            testID="afumusic-refresh"
          >
            <Ionicons name="refresh" size={21} color={loading ? colors.textMuted : accent} />
          </Pressable>
        }
      />

      {loading || !permission ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : !permission.granted ? (
        <ScrollView
          contentContainerStyle={[styles.permissionState, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient colors={[accent, colors.info]} style={styles.permissionHero}>
            <View style={styles.heroIcon}>
              <Ionicons name="musical-notes" size={32} color="#fff" />
            </View>
            <Text style={styles.heroEyebrow}>AFUCHAT MUSIC</Text>
            <Text style={styles.heroTitle}>Your library, without the signal.</Text>
            <Text style={styles.heroCopy}>
              Play the music already on your device. No uploads, no streaming plan, no internet needed.
            </Text>
          </LinearGradient>
          <View style={[styles.permissionCard, { backgroundColor: colors.surface }]}>
            <View style={[styles.cardIcon, { backgroundColor: accent + "18" }]}>
              <Ionicons name="lock-closed" size={20} color={accent} />
            </View>
            <Text style={[styles.permissionTitle, { color: colors.text }]}>Connect your music library</Text>
            <Text style={[styles.permissionCopy, { color: colors.textMuted }]}>
              AfuMusic only reads audio files stored on this device so you can play them offline. We never
              upload or share your songs.
            </Text>
            <Pressable
              onPress={permission.canAskAgain ? handleGrantAccess : openDeviceSettings}
              style={({ pressed }) => [styles.primaryButton, { backgroundColor: accent, opacity: pressed ? 0.75 : 1 }]}
              accessibilityRole="button"
              testID="afumusic-grant-access"
            >
              <Ionicons name={permission.canAskAgain ? "shield-checkmark" : "settings"} size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>
                {permission.canAskAgain ? "Allow music access" : "Open device settings"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + (currentTrack ? 34 : 24) }]}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient colors={[accent, colors.info]} style={styles.libraryHero}>
            <View style={styles.heroTopRow}>
              <View style={styles.heroIcon}>
                <Ionicons name="musical-notes" size={28} color="#fff" />
              </View>
              <View style={styles.offlinePill}>
                <Ionicons name="cloud-offline-outline" size={13} color="#fff" />
                <Text style={styles.offlineText}>DEVICE ONLY</Text>
              </View>
            </View>
            <Text style={styles.libraryTitle}>Your sound, anywhere.</Text>
            <Text style={styles.libraryCopy}>
              {tracks.length > 0
                ? `${tracks.length} ${tracks.length === 1 ? "track" : "tracks"} ready to play offline`
                : "Music saved on this device will appear here"}
            </Text>
          </LinearGradient>

          {error ? (
            <View style={[styles.errorBox, { backgroundColor: colors.errorSubtle }]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.error} />
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              <Pressable onPress={() => void loadTracks()} hitSlop={8}>
                <Text style={[styles.retryText, { color: colors.error }]}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {currentTrack ? (
            <View style={[styles.nowPlaying, { backgroundColor: colors.surface }]}>
              <View style={styles.nowPlayingTop}>
                <View style={[styles.nowPlayingArt, { backgroundColor: accent }]}>
                  <Ionicons name="musical-notes" size={25} color="#fff" />
                </View>
                <View style={styles.nowPlayingInfo}>
                  <Text style={[styles.nowPlayingEyebrow, { color: accent }]}>NOW PLAYING</Text>
                  <Text style={[styles.nowPlayingTitle, { color: colors.text }]} numberOfLines={1}>
                    {displayName(currentTrack.filename)}
                  </Text>
                  <Text style={[styles.nowPlayingMeta, { color: colors.textMuted }]}>From your device library</Text>
                </View>
              </View>
              <View style={[styles.progressTrack, { backgroundColor: colors.backgroundSecondary }]}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: accent,
                      width: `${durationMillis > 0 ? Math.min(100, (positionMillis / durationMillis) * 100) : 0}%`,
                    },
                  ]}
                />
              </View>
              <View style={styles.timeRow}>
                <Text style={[styles.timeText, { color: colors.textMuted }]}>{formatTime(positionMillis / 1000)}</Text>
                <Text style={[styles.timeText, { color: colors.textMuted }]}>{formatTime(durationMillis / 1000)}</Text>
              </View>
              <View style={styles.controls}>
                <Pressable onPress={() => skipTrack(-1)} style={styles.controlButton} hitSlop={8}>
                  <Ionicons name="play-skip-back" size={21} color={colors.text} />
                </Pressable>
                <Pressable
                  onPress={() => void handleTrackPress(currentTrack)}
                  style={[styles.mainControl, { backgroundColor: accent }]}
                  accessibilityRole="button"
                  accessibilityLabel={isPlaying ? "Pause current track" : "Play current track"}
                >
                  <Ionicons name={isPlaying ? "pause" : "play"} size={23} color="#fff" />
                </Pressable>
                <Pressable onPress={() => skipTrack(1)} style={styles.controlButton} hitSlop={8}>
                  <Ionicons name="play-skip-forward" size={21} color={colors.text} />
                </Pressable>
              </View>
            </View>
          ) : null}

          <View style={styles.sectionHeading}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>On this device</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>Ready when you are</Text>
            </View>
            <Ionicons name="list" size={20} color={colors.textMuted} />
          </View>

          {tracks.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.surface }]}>
              <View style={[styles.emptyIcon, { backgroundColor: accent + "18" }]}>
                <Ionicons name="musical-note-outline" size={36} color={accent} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No audio files found</Text>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                Add music to your device library, then refresh AfuMusic. It works completely offline.
              </Text>
              <Pressable onPress={() => void loadTracks()} style={[styles.secondaryButton, { backgroundColor: accent + "18" }]}>
                <Ionicons name="refresh" size={17} color={accent} />
                <Text style={[styles.secondaryButtonText, { color: accent }]}>Refresh library</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.trackList}>
              {tracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  active={track.id === currentTrackId}
                  playing={track.id === currentTrackId && isPlaying}
                  colors={colors}
                  accent={accent}
                  onPress={() => void handleTrackPress(track)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16 },
  permissionState: { padding: 16, gap: 16 },
  centerState: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  permissionHero: { borderRadius: 24, padding: 22, minHeight: 250 },
  libraryHero: { borderRadius: 24, padding: 20, minHeight: 190 },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  heroEyebrow: { color: "rgba(255,255,255,0.78)", fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1.6, marginTop: 22 },
  heroTitle: { color: "#fff", fontSize: 28, lineHeight: 33, fontFamily: "Inter_700Bold", letterSpacing: -0.6, marginTop: 7, maxWidth: 290 },
  heroCopy: { color: "rgba(255,255,255,0.78)", fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular", marginTop: 12 },
  offlinePill: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "rgba(255,255,255,0.18)" },
  offlineText: { color: "#fff", fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.7 },
  libraryTitle: { color: "#fff", fontSize: 26, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginTop: 24 },
  libraryCopy: { color: "rgba(255,255,255,0.80)", fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 7 },
  permissionCard: { borderRadius: 20, padding: 20 },
  cardIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 15 },
  permissionTitle: { fontSize: 19, fontFamily: "Inter_700Bold" },
  permissionCopy: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular", marginTop: 8 },
  primaryButton: { minHeight: 48, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 20 },
  primaryButtonText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, padding: 12, marginTop: 14 },
  errorText: { flex: 1, fontSize: 12, fontFamily: "Inter_500Medium" },
  retryText: { fontSize: 12, fontFamily: "Inter_700Bold" },
  nowPlaying: { borderRadius: 20, padding: 16, marginTop: 16 },
  nowPlayingTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  nowPlayingArt: { width: 56, height: 56, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  nowPlayingInfo: { flex: 1 },
  nowPlayingEyebrow: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.2, marginBottom: 4 },
  nowPlayingTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  nowPlayingMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  progressTrack: { height: 4, borderRadius: 2, overflow: "hidden", marginTop: 18 },
  progressFill: { height: "100%", borderRadius: 2 },
  timeRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  timeText: { fontSize: 10, fontFamily: "Inter_500Medium" },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 34, marginTop: 12 },
  controlButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  mainControl: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 26, marginBottom: 11, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 19, fontFamily: "Inter_700Bold" },
  sectionSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  trackList: { gap: 8 },
  trackRow: { minHeight: 72, borderRadius: 16, flexDirection: "row", alignItems: "center", padding: 10, gap: 12 },
  trackArt: { width: 50, height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  trackInfo: { flex: 1 },
  trackTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  trackMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  trackAction: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  emptyCard: { borderRadius: 20, alignItems: "center", padding: 28, marginTop: 2 },
  emptyIcon: { width: 76, height: 76, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyText: { fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 8, maxWidth: 310 },
  secondaryButton: { flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 14, paddingHorizontal: 15, paddingVertical: 11, marginTop: 18 },
  secondaryButtonText: { fontSize: 13, fontFamily: "Inter_700Bold" },
});