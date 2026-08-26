import { NativeModules, Platform } from "react-native";

let registered = false;

/**
 * Registers the headless service used by React Native Track Player.
 *
 * The NativeModules guard is important: Expo Go does not contain Track Player's
 * native module, and requiring it there can throw before a JS error boundary
 * exists. Standalone Android/iOS builds include the module and register the
 * service during app startup.
 */
export function registerMusicPlaybackService(): void {
  if (registered || Platform.OS === "web") return;
  if (!(NativeModules as Record<string, unknown>).TrackPlayerModule) return;

  try {
    const TrackPlayer = require("react-native-track-player").default;
    const { Event } = require("react-native-track-player");

    TrackPlayer.registerPlaybackService(() => async () => {
      TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
      TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
      TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
      TrackPlayer.addEventListener(Event.RemoteNext, () => TrackPlayer.skipToNext());
      TrackPlayer.addEventListener(Event.RemotePrevious, () => TrackPlayer.skipToPrevious());
      TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }: { position: number }) =>
        TrackPlayer.seekTo(position),
      );
      TrackPlayer.addEventListener(Event.RemoteJumpForward, ({ interval }: { interval: number }) =>
        TrackPlayer.seekBy(interval),
      );
      TrackPlayer.addEventListener(Event.RemoteJumpBackward, ({ interval }: { interval: number }) =>
        TrackPlayer.seekBy(-interval),
      );
      TrackPlayer.addEventListener(Event.RemoteDuck, ({ paused }: { paused: boolean }) =>
        paused ? TrackPlayer.pause() : TrackPlayer.play(),
      );
    });
    registered = true;
  } catch (error) {
    if (__DEV__) console.warn("[AfuMusic] native playback service unavailable", error);
  }
}