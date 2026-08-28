/**
 * Web fallback for expo-share-intent.
 *
 * The native package reads Android/iOS share intents and intentionally has no
 * browser implementation. Keeping this shim at the Metro resolver boundary
 * lets the shared root layout bundle on web without changing native behavior.
 */
import React from "react";

const EMPTY_SHARE_INTENT = Object.freeze({
  type: null,
  text: null,
  webUrl: null,
  files: [],
});

export function ShareIntentProvider({ children }) {
  return children;
}

export function useShareIntentContext() {
  return {
    shareIntent: EMPTY_SHARE_INTENT,
    hasShareIntent: false,
    isReady: true,
    resetShareIntent() {},
  };
}

export default ShareIntentProvider;