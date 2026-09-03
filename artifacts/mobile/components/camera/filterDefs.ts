export type FilterId =
  | "normal"
  | "lipstick_red"
  | "lipstick_pink"
  | "lipstick_coral"
  | "blush"
  | "sunglasses"
  | "beauty"
  | "vintage"
  | "neon";

export interface FilterDef {
  id: FilterId;
  label: string;
  icon: string;
  previewColor: string;
  overlayColor?: string;
  overlayOpacity?: number;
}

export const FILTERS: FilterDef[] = [
  { id: "normal",        label: "Normal",   icon: "camera-outline", previewColor: "#666" },
  { id: "lipstick_red",  label: "Red Lip",  icon: "💋", previewColor: "#CC1A1A" },
  { id: "lipstick_pink", label: "Pink Lip", icon: "🌸", previewColor: "#D1467A" },
  { id: "lipstick_coral",label: "Coral",    icon: "🍑", previewColor: "#E8623A" },
  { id: "blush",         label: "Blush",    icon: "🌷", previewColor: "#F7A8C0" },
  { id: "sunglasses",    label: "Shades",   icon: "🕶️", previewColor: "#1A1A2E" },
  { id: "beauty",        label: "Beauty",   icon: "💫", previewColor: "#FFD7B5", overlayColor: "rgba(255,215,180,0.18)", overlayOpacity: 0.18 },
  { id: "vintage",       label: "Vintage",  icon: "📷", previewColor: "#B8860B", overlayColor: "rgba(160,100,30,0.28)", overlayOpacity: 0.28 },
  { id: "neon",          label: "Neon",     icon: "⚡", previewColor: "#00FF88", overlayColor: "rgba(0,255,136,0.12)", overlayOpacity: 0.12 },
];

export function getLipColor(id: FilterId): string {
  switch (id) {
    case "lipstick_red":   return "rgba(200,20,20,0.72)";
    case "lipstick_pink":  return "rgba(200,60,120,0.72)";
    case "lipstick_coral": return "rgba(230,80,50,0.72)";
    default: return "transparent";
  }
}
