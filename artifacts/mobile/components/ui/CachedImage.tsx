import React, { useEffect, useState } from "react";
import { Image as ExpoImage, type ImageProps } from "expo-image";
import { getCachedImageUri } from "@/lib/storage/mediaCache";

type Props = Omit<ImageProps, "source"> & {
  uri: string | null | undefined;
  cacheType?: "avatar" | "thumb";
};

/**
 * Persistent remote image.
 *
 * expo-image provides a fast memory/disk cache. mediaCache adds a permanent
 * documentDirectory copy so important images survive OS cache eviction and
 * remain available without a network connection after the first download.
 */
export function CachedImage({ uri, cacheType = "thumb", ...props }: Props) {
  const [resolvedUri, setResolvedUri] = useState(uri ?? "");

  useEffect(() => {
    let cancelled = false;
    setResolvedUri(uri ?? "");
    if (!uri || !uri.startsWith("http")) return;

    getCachedImageUri(uri, cacheType)
      .then((localUri) => {
        if (!cancelled && localUri) setResolvedUri(localUri);
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