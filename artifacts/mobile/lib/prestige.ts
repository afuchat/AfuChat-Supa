export type PrestigeTier = {
  id: string;
  label: string;
  minAcoin: number;
  color: string;
  ringColors: [string, string];
  glowColor: string;
  emoji: string;
  tagline: string;
  description: string;
  perks: { icon: string; text: string }[];
};

export const PRESTIGE_TIERS: PrestigeTier[] = [
  {
    id: "bronze",
    label: "Bronze",
    minAcoin: 0,
    color: "#CD7F32",
    ringColors: ["#CD7F32", "#8B4513"],
    glowColor: "#CD7F32",
    emoji: "🥉",
    tagline: "Just getting started",
    description: "Every legend starts here",
    perks: [
      { icon: "ribbon-outline", text: "Bronze badge on your profile" },
      { icon: "storefront-outline", text: "Access to the Prestige shop" },
      { icon: "trophy-outline", text: "Appear on the Rich List" },
    ],
  },
  {
    id: "silver",
    label: "Silver",
    minAcoin: 500,
    color: "#AAAAAA",
    ringColors: ["#E8E8E8", "#909090"],
    glowColor: "#C0C0C0",
    emoji: "🥈",
    tagline: "Making a name for yourself",
    description: "People are starting to notice you",
    perks: [
      { icon: "ellipse-outline", text: "Silver ring around your avatar in all chats" },
      { icon: "star-outline", text: "Silver badge next to your name on posts" },
      { icon: "gift-outline", text: "Unlock Silver-tier Status Goods" },
    ],
  },
  {
    id: "gold",
    label: "Gold",
    minAcoin: 2000,
    color: "#D4A853",
    ringColors: ["#FFD700", "#B8860B"],
    glowColor: "#FFD700",
    emoji: "🥇",
    tagline: "You know how to play",
    description: "The Gold standard of AfuChat",
    perks: [
      { icon: "ellipse", text: "Gold glowing ring on your avatar everywhere" },
      { icon: "text-outline", text: "Your display name appears in gold in every chat" },
      { icon: "search-outline", text: "Priority placement in search results" },
      { icon: "gift-outline", text: "Unlock Gold-tier Status Goods" },
    ],
  },
  {
    id: "diamond",
    label: "Diamond",
    minAcoin: 10000,
    color: "#7DD8F0",
    ringColors: ["#B9F2FF", "#4FC3F7"],
    glowColor: "#4FC3F7",
    emoji: "💎",
    tagline: "Rare and valuable",
    description: "Top 5% of AfuChat. You've earned it",
    perks: [
      { icon: "ellipse", text: "Ice-blue animated diamond ring on your avatar" },
      { icon: "diamond-outline", text: "Diamond glow effect on your messages" },
      { icon: "person-circle-outline", text: "Featured on the Rich List with diamond badge" },
      { icon: "gift-outline", text: "Unlock Diamond-tier Status Goods" },
      { icon: "pricetag-outline", text: "Custom Diamond title on your profile" },
    ],
  },
  {
    id: "obsidian",
    label: "Obsidian",
    minAcoin: 50000,
    color: "#9B59D0",
    ringColors: ["#7B2FBE", "#1A0030"],
    glowColor: "#AF52DE",
    emoji: "⬛",
    tagline: "Dark power",
    description: "Top 1%. Feared and respected",
    perks: [
      { icon: "ellipse", text: "Pulsing dark void ring on your avatar" },
      { icon: "color-palette-outline", text: "Purple particle trail on your messages" },
      { icon: "medal-outline", text: "Exclusive 'Obsidian' title on your profile" },
      { icon: "trophy", text: "Rich List Top 100 dedicated section" },
      { icon: "gift-outline", text: "Unlock Obsidian-tier Status Goods" },
    ],
  },
  {
    id: "legend",
    label: "Legend",
    minAcoin: 200000,
    color: "#FF9500",
    ringColors: ["#FF9500", "#AF52DE"],
    glowColor: "#FF9500",
    emoji: "👑",
    tagline: "The upper 0.1% of AfuChat",
    description: "A living legend. There are very few of you.",
    perks: [
      { icon: "ellipse", text: "Rainbow-shifting Legend ring on your avatar" },
      { icon: "crown-outline", text: "👑 Crown badge visible beside your name everywhere" },
      { icon: "flame", text: "Golden flame aura on all your messages" },
      { icon: "trophy", text: "Permanent Rich List Top 10 showcase" },
      { icon: "diamond-outline", text: "Exclusive Legend showcase on the Discover page" },
      { icon: "gift-outline", text: "All Status Goods unlocked" },
    ],
  },
];

export function getPrestigeTier(acoin: number): PrestigeTier {
  const sorted = [...PRESTIGE_TIERS].reverse();
  return sorted.find((t) => acoin >= t.minAcoin) ?? PRESTIGE_TIERS[0];
}

export function getNextPrestigeTier(acoin: number): PrestigeTier | null {
  const current = getPrestigeTier(acoin);
  const idx = PRESTIGE_TIERS.findIndex((t) => t.id === current.id);
  return PRESTIGE_TIERS[idx + 1] ?? null;
}

export function prestigeProgress(acoin: number): number {
  const current = getPrestigeTier(acoin);
  const next = getNextPrestigeTier(acoin);
  if (!next) return 1;
  return (acoin - current.minAcoin) / (next.minAcoin - current.minAcoin);
}
