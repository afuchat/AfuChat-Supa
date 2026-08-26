import { useEffect } from "react";
import { router, useLocalSearchParams } from "expo-router";

/**
 * Compatibility route for old channel broadcast links.
 *
 * Channels now use the normal chat composer for text, media, voice, and every
 * other supported message type. Keeping this redirect prevents old links from
 * creating legacy `posts` rows.
 */
export default function BroadcastCompatibilityRoute() {
  const { channelId } = useLocalSearchParams<{ channelId?: string }>();

  useEffect(() => {
    if (channelId) {
      router.replace({
        pathname: "/chat/[id]",
        params: { id: channelId, isChannel: "true" },
      });
    } else {
      router.back();
    }
  }, [channelId]);

  return null;
}