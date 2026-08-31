import { Redirect } from "expo-router";

/**
 * Legacy route kept for old links. Language selection is now step one of the
 * Welcome onboarding flow and is rendered by /welcome.
 */
export default function LegacyLanguageSelectRoute() {
  return <Redirect href="/welcome" />;
}