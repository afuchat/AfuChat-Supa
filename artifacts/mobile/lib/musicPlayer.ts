import { NativeModules, Platform } from "react-native";

export type NativeMusicTrack = {
  id: string;
  url: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
};

type TrackPlayerModule = typeof import("react-native-track-player").default;

function getTrackPlayer(): TrackPlayerModule | null {
  if (Platform.OS === "web") return null;
  if (!(NativeModules as Record<string, unknown>).TrackPlayerModule) return null;
  try {
    const candidate = require("react-native-track-player").default as Partial<TrackPlayerModule> | null;
    if (
      !candidate ||
      typeof candidate.setupPlayer !== "function" ||
      typeof candidate.updateOptions !== "function" ||
      typeof candidate.setQueue !== "function" ||
      typeof candidate.play !== "function"
    ) {
      return null;
    }
    return candidate as TrackPlayerModule;
  } catch {
    return null;
  }
}

export function hasNativeMusicPlayer(): boolean {
  return getTrackPlayer() !== null;
}

export function getNativeMusicPlayer(): TrackPlayerModule | null {
  return getTrackPlayer();
}

let setupPromise: Promise<boolean> | null = null;

export async function setupNativeMusicPlayer(): Promise<boolean> {
  const TrackPlayer = getTrackPlayer();
  if (!TrackPlayer) return false;
  if (setupPromise) return setupPromise;

  setupPromise = (async () => {
    try {
      const { Capability, AppKilledPlaybackBehavior } = require("react-native-track-player");
      await TrackPlayer.setupPlayer({
        iosCategory: "playback",
        androidAudioContentType: "music",
      } as any);
      await TrackPlayer.updateOptions({
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.Stop,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
          Capability.JumpForward,
          Capability.JumpBackward,
        ],
        notificationCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
        compactCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
        ],
        forwardJumpInterval: 15,
        backwardJumpInterval: 15,
        progressUpdateEventInterval: 1,
        android: {
          appKilledPlaybackBehavior: AppKilledPlaybackBehavior.ContinuePlayback,
        },
      });
      return true;
    } catch (error: any) {
      if (error?.code === "player_already_initialized") return true;
      setupPromise = null;
      if (__DEV__) console.warn("[AfuMusic] native player setup failed", error);
      return false;
    }
  })();

  return setupPromise;
}

export async function setNativeMusicQueue(
  tracks: NativeMusicTrack[],
  activeIndex: number,
): Promise<boolean> {
  try {
    const TrackPlayer = getTrackPlayer();
    if (!TrackPlayer || !(await setupNativeMusicPlayer())) return false;
    if (Platform.OS === "android") {
      try {
        const Notifications = require("expo-notifications");
        const current = await Notifications.getPermissionsAsync();
        if (current.status !== "granted") {
          await Notifications.requestPermissionsAsync();
        }
      } catch (error) {
        if (__DEV__) console.warn("[AfuMusic] notification permission unavailable", error);
      }
    }
    if (!tracks.length || activeIndex < 0 || activeIndex >= tracks.length) return false;
    await TrackPlayer.setQueue(tracks);
    await TrackPlayer.skip(activeIndex);
    await TrackPlayer.play();
    return true;
  } catch (error) {
    if (__DEV__) console.warn("[AfuMusic] native queue playback unavailable", error);
    return false;
  }
}