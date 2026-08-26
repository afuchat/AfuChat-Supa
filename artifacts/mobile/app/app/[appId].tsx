import React from "react";
import { useLocalSearchParams } from "expo-router";
import AppPageShell, { normalizeAppNavKey, type FullAppId } from "@/components/superapp/AppPageShell";
import AfuPayApp from "@/modules/afupay";
import AfuMarketApp from "@/modules/afumarket";
import AfuBusinessApp from "@/modules/afubusiness";
import AfuServicesApp from "@/modules/afuservices";
import AfuFreelanceApp from "@/modules/afufreelance";
import AfuCollectionsApp from "@/modules/afucollections";
import AfuEventsApp from "@/modules/afuevents";
import AfuUsernamesApp from "@/modules/afuusernames";
import GamesScreen from "@/app/games";
import LabScreen from "@/app/lab";
import { SearchScreen } from "@/app/(tabs)/search";
import FileManagerScreen from "@/app/file-manager";
import GiftsScreen from "@/app/gifts";
import AfuMusicScreen from "@/app/afumusic";
import MatchScreen from "@/app/match";

const APP_IDS: FullAppId[] = [
  "afupay", "afumarket", "afugames", "afubusiness", "afusearch", "afulens",
  "afuservices", "afufreelance", "afufiles", "afugifts", "afumusic",
  "afuevents", "afumatch", "afucollections", "afuusernames",
];

function isAppId(value: string): value is FullAppId {
  return APP_IDS.includes(value as FullAppId);
}

function AppContent({ appId, section }: { appId: FullAppId; section?: string }) {
  switch (appId) {
    case "afupay":
      return <AfuPayApp initialView={section as any} />;
    case "afumarket":
      return <AfuMarketApp initialScreen={section as any} />;
    case "afugames":
      return <GamesScreen />;
    case "afubusiness":
      return <AfuBusinessApp initialScreen={section as any} />;
    case "afusearch":
      return <SearchScreen initialTab={section as any} />;
    case "afulens":
      return <LabScreen />;
    case "afuservices":
      return <AfuServicesApp initialScreen={section as any} />;
    case "afufreelance":
      return <AfuFreelanceApp initialScreen={section as any} />;
    case "afufiles":
      return <FileManagerScreen />;
    case "afugifts":
      return <GiftsScreen />;
    case "afumusic":
      return <AfuMusicScreen />;
    case "afuevents":
      return <AfuEventsApp initialTab={section as any} />;
    case "afumatch":
      return <MatchScreen initialTab={section as any} />;
    case "afucollections":
      return <AfuCollectionsApp />;
    case "afuusernames":
      return <AfuUsernamesApp initialTab={section as any} />;
  }
}

export default function FullAppRoute() {
  const params = useLocalSearchParams<{ appId?: string; section?: string }>();
  const rawId = Array.isArray(params.appId) ? params.appId[0] : params.appId;
  const section = Array.isArray(params.section) ? params.section[0] : params.section;
  if (!rawId || !isAppId(rawId)) return null;
  return (
    <AppPageShell appId={rawId} activeKey={normalizeAppNavKey(section)} showNav={rawId !== "afufiles"}>
      <AppContent appId={rawId} section={section} />
    </AppPageShell>
  );
}