import React, { useCallback, useRef, useState } from "react";
import {
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/hooks/useTheme";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { WebView } from "react-native-webview";

export default function BrowserScreen() {
  const { url: rawUrl } = useLocalSearchParams<{ url?: string }>();
  const url = rawUrl ? decodeURIComponent(rawUrl as string) : "";
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const webViewRef = useRef<any>(null);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [pageTitle, setPageTitle] = useState("");

  const handleNavigationStateChange = useCallback((state: any) => {
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
    if (state.url) setCurrentUrl(state.url);
    if (state.title) setPageTitle(state.title);
  }, []);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({ url: currentUrl, title: pageTitle || currentUrl });
    } catch {}
  }, [currentUrl, pageTitle]);

  const openInChrome = useCallback(() => {
    WebBrowser.openBrowserAsync(currentUrl, {
      showTitle: true,
      enableBarCollapsing: true,
    }).catch(() => {});
  }, [currentUrl]);

  const handleCopyUrl = useCallback(() => {
    Clipboard.setStringAsync(currentUrl).catch(() => {});
  }, [currentUrl]);

  const displayUrl = (() => {
    try {
      const u = new URL(currentUrl);
      return (u.hostname + u.pathname).replace(/\/$/, "") || currentUrl;
    } catch {
      return currentUrl;
    }
  })();

  const bg = isDark ? "#1a1a1a" : "#f5f5f5";
  const headerBg = isDark ? "#111111" : "#ffffff";
  const borderColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  return (
    <View style={[styles.root, { backgroundColor: bg, paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: headerBg, borderBottomColor: borderColor }]}>
        {/* Close */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={22} color={colors.text} />
        </TouchableOpacity>

        {/* URL bar */}
        <TouchableOpacity
          style={[styles.urlBar, { backgroundColor: isDark ? "#2a2a2a" : "#f0f0f0" }]}
          onLongPress={handleCopyUrl}
          activeOpacity={0.7}
        >
          <Ionicons
            name="lock-closed"
            size={11}
            color={isDark ? "#8e8e93" : "#6d6d72"}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[styles.urlText, { color: isDark ? "#ebebf5" : "#1c1c1e" }]}
            numberOfLines={1}
          >
            {displayUrl}
          </Text>
        </TouchableOpacity>

        {/* Share */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={handleShare}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        >
          <Ionicons name="share-outline" size={21} color={colors.text} />
        </TouchableOpacity>

        {/* Open in Chrome */}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={openInChrome}
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 10 }}
        >
          <Ionicons name="open-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* ── Progress bar ── */}
      {loading && (
        <View style={[styles.progressTrack, { backgroundColor: borderColor }]}>
          <View
            style={[
              styles.progressFill,
              { width: `${Math.round(progress * 100)}%` as any },
            ]}
          />
        </View>
      )}

      {/* ── WebView ── */}
      {WebView && url ? (
        <WebView
          ref={webViewRef}
          source={{ uri: url }}
          style={styles.webview}
          onLoadProgress={({ nativeEvent }: any) => {
            setProgress(nativeEvent.progress);
            setLoading(nativeEvent.progress < 1);
          }}
          onNavigationStateChange={handleNavigationStateChange}
          onError={() => setLoading(false)}
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          javaScriptEnabled
          domStorageEnabled
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
        />
      ) : (
        <View style={[styles.center, { backgroundColor: bg }]}>
          <Text style={{ color: colors.textMuted }}>No URL provided.</Text>
        </View>
      )}

      {/* ── Bottom nav bar ── */}
      <View
        style={[
          styles.bottomNav,
          {
            backgroundColor: headerBg,
            borderTopColor: borderColor,
            paddingBottom: insets.bottom || 12,
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.navBtn, !canGoBack && styles.disabled]}
          onPress={() => webViewRef.current?.goBack()}
          disabled={!canGoBack}
        >
          <Ionicons name="chevron-back" size={22} color={canGoBack ? colors.text : colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navBtn, !canGoForward && styles.disabled]}
          onPress={() => webViewRef.current?.goForward()}
          disabled={!canGoForward}
        >
          <Ionicons name="chevron-forward" size={22} color={canGoForward ? colors.text : colors.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => webViewRef.current?.reload()}
        >
          <Ionicons name="refresh" size={21} color={colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    paddingHorizontal: 8,
    gap: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  urlBar: {
    flex: 1,
    height: 34,
    borderRadius: 10,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  urlText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  progressTrack: {
    height: 2,
    width: "100%",
  },
  progressFill: {
    height: 2,
    backgroundColor: "#1f95ff",
  },
  webview: {
    flex: 1,
  },
  bottomNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    height: 48,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navBtn: {
    width: 44,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.35,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
