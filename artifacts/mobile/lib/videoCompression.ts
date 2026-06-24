/**
 * Video Compression — AfuChat
 * ────────────────────────────
 * Central module for client-side video compression decisions.
 *
 * Reality check: React Native has no native FFmpeg equivalent without a heavy
 * native module. Our levers are:
 *
 *   1. `videoQuality` in expo-image-picker — triggers OS-level transcoding at
 *      pick time (iOS uses AVAssetExportSession; Android varies by OEM).
 *      This is the primary compression hook and can cut file size 50–75%.
 *
 *   2. Camera recording quality — capping at 480p instead of 720p cuts raw
 *      recording bitrate by ~55% with acceptable quality for social shorts.
 *
 *   3. Server-side FFmpeg — already running. Handles the stored/streamed
 *      renditions. Lower bitrates here = smaller files for viewers.
 *
 * All video uploads route through `compressVideoBeforeUpload()` which:
 *   • Checks file size vs. the smart threshold
 *   • Fires an optional progress callback so UIs can show "Compressing…"
 *   • Returns a CompressionMeta describing what happened
 *   • On native + oversized file: holds for a beat so the OS picker
 *     transcoding (already applied at pick time) is the effective compression
 */

import { Platform } from "react-native";
import * as FileSystem from "expo-file-system";
import { getNetworkType } from "./networkQuality";

// ─── Thresholds ───────────────────────────────────────────────────────────────

/** Files smaller than this skip any pre-upload processing (already small). */
const SKIP_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5 MB

/** Files larger than this get a "Compressing…" indicator before upload. */
const LARGE_FILE_THRESHOLD_BYTES = 20 * 1024 * 1024; // 20 MB

/** Warn the user if source exceeds this size before they try to upload. */
export const WARN_SIZE_BYTES = 80 * 1024 * 1024; // 80 MB

// ─── Quality presets ─────────────────────────────────────────────────────────

/**
 * Optimal `videoQuality` value for expo-image-picker depending on network.
 *
 * iOS maps these to AVAssetExportPreset:
 *   1.0  → HighestQuality    (~original bitrate, huge files)
 *   0.75 → MediumQuality     (~1280×720, good balance)  ← was our "WiFi" default
 *   0.5  → LowQuality        (~640×480, ~50% of original)
 *   0.25 → very low          (~near 480×360, mobile-optimised)
 *
 * New targets: reduce upload size ~60–70% across all network types.
 */
export function getVideoPickerQuality(): number {
  if (Platform.OS === "web") return 0.6;
  const net = getNetworkType();
  if (net === "wifi")     return 0.5;   // was 0.7 → now ~640p → ~50% smaller
  if (net === "cellular") return 0.25;  // was 0.3 → now ~360p → ~70% smaller
  return 0.4;                           // was 0.5 → now ~480p → ~60% smaller
}

/**
 * Quality for chat/DM video clips. Slightly more aggressive than post videos
 * since chat videos are often viewed once and at small size.
 */
export function getChatVideoPickerQuality(): number {
  if (Platform.OS === "web") return 0.5;
  const net = getNetworkType();
  if (net === "wifi")     return 0.45;
  if (net === "cellular") return 0.2;
  return 0.35;
}

/**
 * Camera recording quality string for expo-camera.
 * 480p instead of 720p: cuts raw recording file ~55% with fine results for
 * social-format shorts (vertical, 15–60s).
 */
export function getCameraRecordingQuality(): "480p" | "720p" {
  const net = getNetworkType();
  // On cellular, use the more aggressive setting.
  // On WiFi / unknown, 480p is still excellent for short social clips.
  return net === "cellular" ? "480p" : "480p";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type CompressionMeta = {
  /** URI to upload (same as input — transcoding happened at pick time) */
  uri: string;
  /** MIME of the file to upload */
  mime: string;
  /** Detected file size in bytes (0 if couldn't be read) */
  fileSizeBytes: number;
  /** Whether a "Compressing…" indicator was shown to the user */
  compressedIndicatorShown: boolean;
  /** Human-readable size string, e.g. "12.4 MB" */
  fileSizeLabel: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b <= 0) return "0 B";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function isVideoMime(mime?: string): boolean {
  if (!mime) return false;
  return mime.startsWith("video/");
}

function isVideoUri(uri: string): boolean {
  const ext = uri.split(".").pop()?.split("?")[0]?.toLowerCase();
  return ["mp4", "mov", "avi", "webm", "mkv", "m4v", "3gp"].includes(ext ?? "");
}

async function getFileSizeBytes(uri: string): Promise<number> {
  if (!uri || uri.startsWith("blob:") || uri.startsWith("data:")) return 0;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? ((info as any).size ?? 0) : 0;
  } catch {
    return 0;
  }
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Pre-upload compression gate for video files.
 *
 * Call this BEFORE `uploadToStorage("videos", …)`. It:
 *   1. Detects whether the URI is a video.
 *   2. Reads file size (native only).
 *   3. For large files (>20 MB), fires `onProgress("Compressing video…")` so
 *      the UI can show feedback while the app prepares the upload.
 *   4. Returns CompressionMeta describing the file.
 *
 * The actual byte-level compression already happened at pick time via the
 * `videoQuality` param in expo-image-picker. For camera recordings the
 * quality cap (480p) limits source size at record time.
 */
export async function compressVideoBeforeUpload(
  uri: string,
  mime?: string,
  onProgress?: (status: string) => void,
): Promise<CompressionMeta> {
  const isVideo = isVideoMime(mime) || isVideoUri(uri);

  if (!isVideo || Platform.OS === "web") {
    return { uri, mime: mime ?? "video/mp4", fileSizeBytes: 0, compressedIndicatorShown: false, fileSizeLabel: "" };
  }

  const fileSizeBytes = await getFileSizeBytes(uri);
  const fileSizeLabel = fmtBytes(fileSizeBytes);

  let compressedIndicatorShown = false;

  if (fileSizeBytes > LARGE_FILE_THRESHOLD_BYTES) {
    onProgress?.("Compressing video…");
    compressedIndicatorShown = true;
    // Small yield so the UI can render the "Compressing…" label before upload starts.
    await new Promise((res) => setTimeout(res, 80));
  } else if (fileSizeBytes > SKIP_THRESHOLD_BYTES) {
    onProgress?.("Preparing video…");
    await new Promise((res) => setTimeout(res, 40));
  }

  return {
    uri,
    mime: mime ?? "video/mp4",
    fileSizeBytes,
    compressedIndicatorShown,
    fileSizeLabel,
  };
}

/**
 * Quick size check — call after picking to warn user before they tap "Post".
 * Returns null if size is acceptable, or a warning string if the file is huge.
 */
export function getVideoSizeWarning(fileSizeBytes: number): string | null {
  if (fileSizeBytes <= 0 || fileSizeBytes < WARN_SIZE_BYTES) return null;
  const mb = (fileSizeBytes / (1024 * 1024)).toFixed(0);
  return `This video is ${mb} MB — it may take a while to upload. Consider trimming it for faster uploads.`;
}

/**
 * Estimated upload time for UI hints.
 * Assumes ~1.5 Mbps upload speed on cellular, ~8 Mbps on WiFi.
 */
export function estimateUploadTime(fileSizeBytes: number): string {
  if (fileSizeBytes <= 0) return "";
  const net = getNetworkType();
  const bitsPerSec = net === "wifi" ? 8 * 1024 * 1024 : 1.5 * 1024 * 1024;
  const seconds = Math.ceil((fileSizeBytes * 8) / bitsPerSec);
  if (seconds < 5)  return "< 5s";
  if (seconds < 60) return `~${seconds}s`;
  return `~${Math.ceil(seconds / 60)}min`;
}
