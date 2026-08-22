import { Linking, Platform } from "react-native";

const ANDROID_PACKAGE = "com.afuchat.afuapp";
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

/**
 * Opens the AfuChat Play Store listing, preferring the native Play Store app
 * on Android and using the browser everywhere else.
 */
export async function openAppReview(): Promise<void> {
  if (Platform.OS === "android") {
    const marketUrl = `market://details?id=${ANDROID_PACKAGE}`;
    try {
      if (await Linking.canOpenURL(marketUrl)) {
        await Linking.openURL(marketUrl);
        return;
      }
    } catch {
      // Fall through to the browser listing.
    }
  }

  await Linking.openURL(PLAY_STORE_URL);
}