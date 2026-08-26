import { Redirect } from "expo-router";

// Kept only as a compatibility handoff for old links. Services are part of
// Wallet now and this route must never render a second Services app.
export default function LegacyMiniProgramsRoute() {
  return <Redirect href="/app/afupay?section=services" />;
}