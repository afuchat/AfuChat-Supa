import React from "react";
import { View } from "react-native";
import { useTheme } from "@/hooks/useTheme";
import AppBottomNav, { type AppNavItem } from "./AppBottomNav";

export type FullAppId =
  | "afupay"
  | "afumarket"
  | "afugames"
  | "afubusiness"
  | "afusearch"
  | "afulens"
  | "afuservices"
  | "afufreelance"
  | "afufiles"
  | "afugifts"
  | "afumusic"
  | "afuevents"
  | "afumatch"
  | "afucollections"
  | "afuusernames"
  | "afuid"
  | "afuqr"
  | "afusaved";

const NAV: Record<FullAppId, AppNavItem[]> = {
  afupay: [
    { key: "home", label: "Overview", icon: "wallet-outline", href: "/app/afupay" },
    { key: "history", label: "Activity", icon: "receipt-outline", href: "/app/afupay?section=history" },
    { key: "topup", label: "Top up", icon: "add-circle-outline", href: "/app/afupay?section=topup" },
    { key: "requests", label: "Requests", icon: "arrow-down-circle-outline", href: "/app/afupay?section=requests" },
  ],
  afumarket: [
    { key: "browse", label: "Browse", icon: "storefront-outline", href: "/app/afumarket" },
    { key: "cart", label: "Cart", icon: "cart-outline", href: "/app/afumarket?section=cart" },
    { key: "orders", label: "Orders", icon: "receipt-outline", href: "/app/afumarket?section=orders" },
    { key: "sell", label: "Sell", icon: "pricetag-outline", href: "/app/afumarket?section=apply-seller" },
  ],
  afugames: [
    { key: "games", label: "Games", icon: "game-controller-outline", href: "/app/afugames" },
    { key: "progress", label: "My progress", icon: "trophy-outline", href: "/app/afugames?section=progress" },
  ],
  afubusiness: [
    { key: "home", label: "Overview", icon: "home-outline", href: "/app/afubusiness" },
    { key: "analytics", label: "Analytics", icon: "bar-chart-outline", href: "/app/afubusiness?section=analytics" },
    { key: "products", label: "Products", icon: "pricetag-outline", href: "/app/afubusiness?section=products" },
    { key: "orders", label: "Orders", icon: "receipt-outline", href: "/app/afubusiness?section=orders" },
  ],
  afusearch: [
    { key: "all", label: "Search", icon: "search-outline", href: "/app/afusearch" },
    { key: "people", label: "People", icon: "people-outline", href: "/app/afusearch?section=people" },
    { key: "posts", label: "Posts", icon: "document-text-outline", href: "/app/afusearch?section=posts" },
    { key: "events", label: "Events", icon: "calendar-outline", href: "/app/afusearch?section=events" },
  ],
  afulens: [
    { key: "scan", label: "Scan", icon: "scan-outline", href: "/app/afulens" },
  ],
  afuservices: [
    { key: "services", label: "Services", icon: "grid-outline", href: "/app/afuservices" },
    { key: "bills", label: "Bills", icon: "receipt-outline", href: "/app/afuservices?section=bills" },
    { key: "airtime", label: "Airtime", icon: "phone-portrait-outline", href: "/app/afuservices?section=airtime" },
    { key: "wallet", label: "Wallet", icon: "wallet-outline", href: "/app/afupay" },
  ],
  afufreelance: [
    { key: "browse", label: "Browse", icon: "search-outline", href: "/app/afufreelance" },
    { key: "post-gig", label: "Post a gig", icon: "add-circle-outline", href: "/app/afufreelance?section=post-gig" },
  ],
  afufiles: [
    { key: "library", label: "Library", icon: "folder-outline", href: "/file-manager" },
  ],
  afugifts: [
    { key: "gifts", label: "My gifts", icon: "gift-outline", href: "/app/afugifts" },
    { key: "marketplace", label: "Marketplace", icon: "storefront-outline", href: "/app/afugifts?section=marketplace" },
  ],
  afumusic: [
    { key: "library", label: "Library", icon: "musical-notes-outline", href: "/app/afumusic" },
  ],
  afuevents: [
    { key: "upcoming", label: "Upcoming", icon: "calendar-outline", href: "/app/afuevents" },
    { key: "online", label: "Online", icon: "globe-outline", href: "/app/afuevents?section=online" },
    { key: "free", label: "Free", icon: "ticket-outline", href: "/app/afuevents?section=free" },
  ],
  afumatch: [
    { key: "discover", label: "Discover", icon: "heart-outline", href: "/app/afumatch" },
    { key: "matches", label: "My matches", icon: "people-outline", href: "/app/afumatch?section=matches" },
    { key: "preferences", label: "Preferences", icon: "options-outline", href: "/app/afumatch?section=preferences" },
  ],
  afucollections: [
    { key: "collections", label: "Collections", icon: "albums-outline", href: "/app/afucollections" },
  ],
  afuusernames: [
    { key: "market", label: "Market", icon: "storefront-outline", href: "/app/afuusernames" },
    { key: "owned", label: "Owned", icon: "at-outline", href: "/app/afuusernames?section=owned" },
    { key: "mine", label: "My listings", icon: "pricetag-outline", href: "/app/afuusernames?section=mine" },
  ],
  afuid: [
    { key: "card", label: "My ID", icon: "id-card-outline", href: "/app/afuid" },
  ],
  afuqr: [
    { key: "scan", label: "Scan", icon: "qr-code-outline", href: "/app/afuqr" },
  ],
  afusaved: [
    { key: "saved", label: "Saved", icon: "bookmark-outline", href: "/app/afusaved" },
  ],
};

export function getAppNav(appId: FullAppId) {
  return NAV[appId];
}

export function normalizeAppNavKey(section?: string) {
  if (section === "apply-seller") return "sell";
  if (section === "post-gig") return "post-gig";
  return section;
}

type Props = {
  appId: FullAppId;
  activeKey?: string;
  showNav?: boolean;
  children: React.ReactNode;
};

export default function AppPageShell({ appId, activeKey, showNav = true, children }: Props) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, position: "relative", overflow: "hidden" }}>{children}</View>
      {showNav && <AppBottomNav items={getAppNav(appId)} activeKey={activeKey} />}
    </View>
  );
}