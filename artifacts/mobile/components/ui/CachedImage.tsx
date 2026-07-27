import React, { useEffect, useState } from "react";
import { Image as ExpoImage, type ImageProps } from "expo-image";
import { getCachedImageUri, getCachedImageUriSync } from "@/lib/storage/mediaCache";

type Props = Omit<ImageProps, "source"> & {
  uri: string | null | undefined;
  cacheType?: "avatar" | "thumb";
};

/**
 * Persistent remote image — instant, offline-first.
 *
 * On first render the component reads the in-memory cache synchronously so
 * if the image was already downloaded this session it renders with the local
 * path immediately (zero flash, zero network). If not in memory, it falls
 * back to the remote URL while kicking off a background download to permanent
 * documentDirectory storage — next time the same URL is requested, the local
 * copy is used and the component renders instantly.
 *
 * expo-image cachePolicy="memory-disk" provides an additional OS-level cache
 * layer on top of our permanent store, so the fast path is: mem-cache hit
 * (same session) → expo-image disk cache (between restarts) → our permanent
 * documentDirectory copy → network download (first time only).
 */
export function CachedImage({ uri, cacheType = "thumb", ...props }: Props) {
  // Sync read: if this URL is in the in-memory hot cache, use it immediately
  // — no useEffect, no state update, no re-render flash.
  const [resolvedUri, setResolvedUri] = useState<string>(() => {
    if (!uri) return "";
    return getCachedImageUriSync(uri) ?? uri;
  });

  useEffect(() => {
    if (!uri) {
      setResolvedUri("");
      return;
    }

    // Sync check again in case this effect fires before initial state is read
    const sync = getCachedImageUriSync(uri);
    if (sync) {
      setResolvedUri(sync);
      return;
    }

    // Not in memory — show remote URL now, swap to local path when ready
    setResolvedUri(uri);

    let cancelled = false;
    getCachedImageUri(uri, cacheType)
      .then((localUri) => {
        if (!cancelled && localUri && localUri !== uri) {
          setResolvedUri(localUri);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [uri, cacheType]);

  if (!resolvedUri) return null;

  return (
    <ExpoImage
      {...props}
      source={{ uri: resolvedUri }}
      cachePolicy="memory-disk"
      transition={0}
    />
  );
}

export default CachedImage;
