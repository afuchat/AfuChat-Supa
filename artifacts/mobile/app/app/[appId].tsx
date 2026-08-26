import React from "react";
import { useLocalSearchParams } from "expo-router";
import AppPageShell, { normalizeAppNavKey, type FullAppId } from "@/components/superapp/AppPageShell";
import AfuPayApp from "@/modules/afupay";
import AfuMarketApp from "@/modules/afumarket";
import AfuBusinessApp from "@/modules/afubusiness";
import AfuFreelanceApp from "@/modules/afufreelance";
import AfuCollectionsApp from "@/modules/afucollections";
import AfuEventsApp from "@/modules/afuevents";
import AfuUsernamesApp from "@/modules/afuusernames";
import AfuQRApp from "@/modules/afuqr";
import AfuSavedApp from "@/modules/afusaved";
import GamesScreen from "@/app/games";
import PlayRouter from "@/app/games/play";
import KampalaHustleGame from "@/app/games/lifesim";
import LabScreen from "@/app/lab";
import { SearchScreen } from "@/app/(tabs)/search";
import FileManagerScreen from "@/app/file-manager";
import GiftsScreen from "@/app/gifts";
import GiftMarketplaceScreen from "@/app/gifts/marketplace";
import AfuMusicScreen from "@/app/afumusic";
import MatchScreen from "@/app/match";
import MatchPreferencesScreen from "@/app/match/preferences";
import CartScreen from "@/app/shop/cart";
import MyOrdersScreen from "@/app/shop/my-orders";
import BillsScreen from "@/app/mini-programs/bills";
import AirtimeScreen from "@/app/mini-programs/airtime";
import DataBundlesScreen from "@/app/mini-programs/data-bundles";
import FeeDetailsScreen from "@/app/mini-programs/fee-details";
import HotelsScreen from "@/app/mini-programs/hotels";
import TicketsScreen from "@/app/mini-programs/tickets";
import TransferScreen from "@/app/mini-programs/transfer";

const APP_IDS: FullAppId[] = [
  "afupay", "afumarket", "afugames", "afubusiness", "afusearch", "afulens",
  "afufreelance", "afufiles", "afugifts", "afumusic",
  "afuevents", "afumatch", "afucollections", "afuusernames",
  "afuqr", "afusaved",
];

function isAppId(value: string): value is FullAppId {
  return APP_IDS.includes(value as FullAppId);
}

function AppContent({
  appId,
  section,
  params,
}: {
  appId: FullAppId;
  section?: string;
  params: Record<string, string>;
}) {
  switch (appId) {
    case "afupay":
      if (section === "bills") return <BillsScreen />;
      if (section === "airtime") return <AirtimeScreen />;
      if (section === "data-bundles") return <DataBundlesScreen />;
      if (section === "fee-details") return <FeeDetailsScreen />;
      if (section === "hotels") return <HotelsScreen />;
      if (section === "tickets") return <TicketsScreen />;
      if (section === "transfer") return <TransferScreen />;
      return (
        <AfuPayApp
          initialView={section as any}
          initialRecipientId={params.initialRecipientId ?? params.recipientId}
          paymentReference={params.paymentReference}
        />
      );
    case "afumarket":
      if (section === "cart") return <CartScreen />;
      if (section === "orders") return <MyOrdersScreen />;
      return <AfuMarketApp initialScreen={section as any} />;
    case "afugames":
      if (section === "progress") return <KampalaHustleGame />;
      if (section === "play") return <PlayRouter />;
      return <GamesScreen />;
    case "afubusiness":
      return <AfuBusinessApp initialScreen={section as any} />;
    case "afusearch":
      return <SearchScreen initialTab={section as any} />;
    case "afulens":
      return <LabScreen />;
    case "afufreelance":
      return <AfuFreelanceApp initialScreen={section as any} />;
    case "afufiles":
      return <FileManagerScreen />;
    case "afugifts":
      if (section === "marketplace") return <GiftMarketplaceScreen />;
      return <GiftsScreen />;
    case "afumusic":
      return <AfuMusicScreen />;
    case "afuevents":
      return <AfuEventsApp initialTab={section as any} />;
    case "afumatch":
      if (section === "preferences") return <MatchPreferencesScreen />;
      return <MatchScreen initialTab={section as any} />;
    case "afucollections":
      return <AfuCollectionsApp />;
    case "afuusernames":
      return <AfuUsernamesApp initialTab={section as any} />;
    case "afuqr":
      return <AfuQRApp />;
    case "afusaved":
      return <AfuSavedApp />;
  }
}

export default function FullAppRoute() {
  const params = useLocalSearchParams<{
    appId?: string;
    section?: string;
    initialRecipientId?: string;
    recipientId?: string;
    paymentReference?: string;
  }>();
  const rawId = Array.isArray(params.appId) ? params.appId[0] : params.appId;
  const section = Array.isArray(params.section) ? params.section[0] : params.section;
  const routeParams = Object.fromEntries(
    Object.entries(params).flatMap(([key, value]) => {
      const normalized = Array.isArray(value) ? value[0] : value;
      return normalized == null ? [] : [[key, normalized]];
    }),
  ) as Record<string, string>;
  if (!rawId || !isAppId(rawId)) return null;
  return (
    <AppPageShell appId={rawId} activeKey={normalizeAppNavKey(section)} showNav={rawId !== "afufiles"}>
      <AppContent appId={rawId} section={section} params={routeParams} />
    </AppPageShell>
  );
}