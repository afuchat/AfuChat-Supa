import React, { useCallback, useEffect, useRef, useState } from "react";
import { subscribeCallAudio } from "@/lib/callAudioBus";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  GestureResponderEvent,
  LayoutChangeEvent,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
// expo-av: lazy-load; guard NativeModules.ExponentAV — absent in Expo Go SDK 55
let Audio: typeof import("expo-av").Audio | null = null;
try {
  const { NativeModules: _NM } = require("react-native");
  if (_NM.ExponentAV) Audio = require("expo-av").Audio;
} catch {}
type AVPlaybackStatus = import("expo-av").AVPlaybackStatus;
type AudioSound = import("expo-av/build/Audio/Sound").Sound;

interface AudioPlayerProps {
  uri: string;
  tintColor?: string;
  waveColor?: string;
}

const SPEEDS = [1, 1.5, 2] as const;
type Speed = (typeof SPEEDS)[number];

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

const BARS = 28;

function buildWaveBars(bars: number): number[] {
  return Array.from({ length: bars }, (_, i) => {
    const base = 0.3 + Math.sin(i * 0.85) * 0.25 + Math.cos(i * 1.4 + 0.6) * 0.15;
    return Math.max(0.15, Math.min(0.95, base));
  });
}

const WAVE_SHAPE = buildWaveBars(BARS);

function AudioPlayerIdle({
  onPlay,
  tintColor,
  waveColor,
}: {
  onPlay: () => void;
  tintColor: string;
  waveColor?: string;
}) {
  const barColor = waveColor || tintColor;
  return (
    <View style={s.row}>
      <TouchableOpacity onPress={onPlay} hitSlop={8}>
        <Ionicons name="play" size={24} color={tintColor} />
      </TouchableOpacity>
      <View style={s.waveContainer}>
        {WAVE_SHAPE.map((h, i) => (
          <View
            key={i}
            style={[s.bar, { height: `${h * 100}%`, backgroundColor: `${barColor}40` }]}
          />
        ))}
      </View>
      <Text style={[s.speed, { color: tintColor, opacity: 0.45 }]}>1×</Text>
      <Text style={[s.time, { color: tintColor, opacity: 0.55 }]}>-:--</Text>
    </View>
  );
}

function AudioPlayerActive({ uri, tintColor = "#FFFFFF", waveColor }: AudioPlayerProps) {
  const soundRef = useRef<AudioSound | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [didJustFinish, setDidJustFinish] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const trackWidth = useRef(0);
  const barColor = waveColor || tintColor;

  useEffect(() => {
    let mounted = true;

    async function loadAudio() {
      try {
        if (!Audio) return;
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,   // ensure session is in playback mode, not recording
          playsInSilentModeIOS: true,
          shouldDuckAndroid: false,
          staysActiveInBackground: false,
        }).then(() => {}, () => {});

        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: true, progressUpdateIntervalMillis: 80 },
          (status: AVPlaybackStatus) => {
            if (!mounted) return;
            if (status.isLoaded) {
              setIsLoaded(true);
              setIsPlaying(status.isPlaying);
              setPositionMs(status.positionMillis ?? 0);
              setDurationMs(status.durationMillis ?? 0);
              if (status.didJustFinish) {
                setDidJustFinish(true);
              }
            }
          }
        );

        if (mounted) soundRef.current = sound;
        else sound.unloadAsync().catch(() => {});
      } catch {
        // Audio module unavailable (e.g. Expo Go restriction) — fail silently
        // so the UI degrades gracefully rather than crashing
      }
    }

    loadAudio();

    return () => {
      mounted = false;
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, [uri]);

  useEffect(() => {
    if (didJustFinish && soundRef.current) {
      soundRef.current.setPositionAsync(0).catch(() => {});
      setDidJustFinish(false);
    }
  }, [didJustFinish]);

  // Pause playback the moment a call takes over the mic / speaker.
  // The OS audio session (set via setAudioModeAsync in callEngine) already
  // interrupts on iOS/Android, but pausing here ensures the play-button UI
  // reflects the correct state and prevents a race on Android.
  useEffect(() => {
    return subscribeCallAudio((event) => {
      if (event === "takeover" && soundRef.current) {
        soundRef.current.pauseAsync().catch(() => {});
      }
    });
  }, []);

  const togglePlay = useCallback(async () => {
    if (!isLoaded || !soundRef.current) return;
    try {
      if (isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        if (positionMs >= durationMs && durationMs > 0) {
          await soundRef.current.setPositionAsync(0);
        }
        await soundRef.current.playAsync();
      }
    } catch {}
  }, [isPlaying, positionMs, durationMs, isLoaded]);

  const cycleSpeed = useCallback(async () => {
    if (!isLoaded || !soundRef.current) return;
    const idx = SPEEDS.indexOf(speed);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setSpeed(next);
    try {
      await soundRef.current.setRateAsync(next, true);
    } catch {}
  }, [speed, isLoaded]);

  const seekFromTouch = useCallback(
    async (e: GestureResponderEvent) => {
      if (!isLoaded || durationMs === 0 || !soundRef.current) return;
      const { locationX } = e.nativeEvent;
      const ratio = Math.max(0, Math.min(1, locationX / (trackWidth.current || 1)));
      try {
        await soundRef.current.setPositionAsync(ratio * durationMs);
      } catch {}
    },
    [isLoaded, durationMs]
  );

  const onTrackLayout = useCallback((e: LayoutChangeEvent) => {
    trackWidth.current = e.nativeEvent.layout.width;
  }, []);

  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const filled = Math.round(progress * BARS);
  const displayTime =
    isPlaying || positionMs > 0 ? formatTime(positionMs) : formatTime(durationMs);

  return (
    <View style={s.row}>
      <TouchableOpacity onPress={togglePlay} hitSlop={8} disabled={!isLoaded}>
        {!isLoaded ? (
          <Ionicons name="ellipsis-horizontal" size={24} color={tintColor} style={{ opacity: 0.5 }} />
        ) : (
          <Ionicons name={isPlaying ? "pause" : "play"} size={24} color={tintColor} />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.85}
        style={s.waveContainer}
        onPress={seekFromTouch}
        onLayout={onTrackLayout}
      >
        {WAVE_SHAPE.map((h, i) => (
          <View
            key={i}
            style={[
              s.bar,
              {
                height: `${h * 100}%`,
                backgroundColor: i < filled ? barColor : `${barColor}40`,
              },
            ]}
          />
        ))}
      </TouchableOpacity>

      <TouchableOpacity onPress={cycleSpeed} hitSlop={8} disabled={!isLoaded}>
        <Text style={[s.speed, { color: tintColor, opacity: isLoaded ? 1 : 0.4 }]}>
          {speed}×
        </Text>
      </TouchableOpacity>

      <Text style={[s.time, { color: tintColor }]}>{displayTime}</Text>
    </View>
  );
}

export default function AudioPlayer({ uri, tintColor = "#FFFFFF", waveColor }: AudioPlayerProps) {
  const [active, setActive] = useState(false);

  if (!active) {
    return (
      <AudioPlayerIdle
        onPlay={() => setActive(true)}
        tintColor={tintColor}
        waveColor={waveColor}
      />
    );
  }

  return <AudioPlayerActive uri={uri} tintColor={tintColor} waveColor={waveColor} />;
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 200,
    paddingVertical: 4,
  },
  waveContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 30,
    paddingVertical: 2,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    marginHorizontal: 1,
    minWidth: 2,
  },
  speed: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
    minWidth: 24,
    textAlign: "center",
  },
  time: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
    minWidth: 34,
    textAlign: "right",
  },
});
