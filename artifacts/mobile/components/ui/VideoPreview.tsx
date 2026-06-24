import React, { useEffect } from "react";
import { VideoView, useVideoPlayer } from "expo-video";
import type { StyleProp, ViewStyle } from "react-native";

type ContentFit = "contain" | "cover" | "fill";

interface VideoPreviewProps {
  uri: string;
  style?: StyleProp<ViewStyle>;
  contentFit?: ContentFit;
  shouldPlay?: boolean;
  isLooping?: boolean;
  isMuted?: boolean;
  nativeControls?: boolean;
  /** Playback speed multiplier: 0.5 = slow-mo, 1 = normal, 2 = fast-forward */
  playbackRate?: number;
}

export default function VideoPreview({
  uri,
  style,
  contentFit = "cover",
  shouldPlay = true,
  isLooping = true,
  isMuted = false,
  nativeControls = false,
  playbackRate = 1,
}: VideoPreviewProps) {
  const player = useVideoPlayer(uri ? { uri } : null, (p) => {
    p.loop = isLooping;
    p.muted = isMuted;
    p.playbackRate = playbackRate;
    if (shouldPlay) p.play();
  });

  useEffect(() => {
    if (!uri) return;
    player.replaceAsync({ uri }).catch(() => {});
    player.loop = isLooping;
    player.muted = isMuted;
    player.playbackRate = playbackRate;
    if (shouldPlay) player.play(); else player.pause();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uri]);

  useEffect(() => {
    if (shouldPlay) player.play(); else player.pause();
  }, [shouldPlay]);

  useEffect(() => { player.muted = isMuted; }, [isMuted]);
  useEffect(() => { player.loop = isLooping; }, [isLooping]);
  useEffect(() => {
    try { player.playbackRate = playbackRate; } catch {}
  }, [playbackRate]);

  return (
    <VideoView
      player={player}
      style={style}
      contentFit={contentFit}
      nativeControls={nativeControls}
    />
  );
}
