import { supabase } from "@/lib/supabase";

export type UsernameAvailability =
  | { status: "available" | "owned" | "taken" | "invalid_format" }
  | { status: "listed"; listing_id: string; price: number };

export type PublicChatUsernameAvailability =
  | { status: "available" | "taken" | "invalid_format" };

export async function checkUsernameAvailability(username: string): Promise<UsernameAvailability | null> {
  const { data, error } = await supabase.rpc("check_username_availability", {
    p_username: username,
  });
  if (error || !data || typeof data.status !== "string") return null;
  return data as UsernameAvailability;
}

export async function checkPublicChatUsername(username: string): Promise<PublicChatUsernameAvailability | null> {
  const { data, error } = await supabase.rpc("check_public_chat_username", {
    p_username: username,
  });
  if (error || !data || typeof data.status !== "string") return null;
  return data as PublicChatUsernameAvailability;
}

export function usernamePurchasePrompt(
  username: string,
  price: number | undefined,
  openMarketplace: () => void,
) {
  return [
    {
      text: Number.isFinite(price) ? `Buy for ${price} ACoin` : "Buy it first",
      onPress: openMarketplace,
    },
    { text: "Choose another", style: "cancel" as const },
  ];
}