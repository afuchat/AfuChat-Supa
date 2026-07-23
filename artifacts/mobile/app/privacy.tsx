import { useEffect } from "react";
import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";

export default function PrivacyScreen() {
  useEffect(() => {
    WebBrowser.openBrowserAsync("https://afuchat.com/privacy").catch(() => {});
    if (router.canGoBack()) router.back();
  }, []);

  return null;
}