import { Platform, Linking, Share } from "react-native";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { supabase } from "@/lib/supabase";
import { isOnline } from "@/lib/offlineStore";
import {
  getLocalPhoneContacts,
  replacePhoneContactMatches,
  saveDevicePhoneContacts,
  type DevicePhoneContact,
  type LocalPhoneContact,
} from "@/lib/storage/localPhoneContacts";

export const AFUCHAT_DOWNLOAD_URL =
  "https://play.google.com/store/apps/details?id=com.afuchat.afuapp";

export const AFUCHAT_INVITE_MESSAGE = (name: string) =>
  `Hi ${name}, join me on AfuChat: ${AFUCHAT_DOWNLOAD_URL}`;

function countryRegion(value: unknown): CountryCode | undefined {
  if (typeof value !== "string") return undefined;
  const region = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(region) ? (region as CountryCode) : undefined;
}

/**
 * Matching uses E.164 whenever the device provides enough country information.
 * The original device number is kept separately for display, so formatting
 * never changes the contact's visible name or device ordering.
 */
export function normalizePhoneNumber(raw: string, region?: unknown): string {
  const value = raw.trim();
  if (!value) return "";

  const parsed = parsePhoneNumberFromString(value, countryRegion(region));
  if (parsed?.number) return parsed.number;

  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (value.startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

async function readDevicePhoneContacts(): Promise<{
  contacts: DevicePhoneContact[];
  permission: "granted" | "denied" | "unavailable";
}> {
  if (Platform.OS === "web") return { contacts: [], permission: "unavailable" };

  try {
    const Contacts = require("expo-contacts") as typeof import("expo-contacts");
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== "granted") return { contacts: [], permission: "denied" };

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
    });
    const contacts: DevicePhoneContact[] = [];

    data.forEach((contact, position) => {
      const name = contact.name?.trim() || "Unknown";
      (contact.phoneNumbers ?? []).forEach((phoneNumber, phoneIndex) => {
        const raw = (phoneNumber.number ?? "").trim();
        const normalized = normalizePhoneNumber(
          raw,
          (phoneNumber as { countryCode?: string | null }).countryCode,
        );
        if (!raw || !normalized) return;

        contacts.push({
          key: `${contact.id ?? position}:${phoneIndex}`,
          name,
          // Keep the device's exact display value. Only normalized_phone is
          // used for matching, so local contacts never get reformatted.
          phone: raw,
          normalized_phone: normalized,
          position,
          phone_index: phoneIndex,
        });
      });
    });

    return { contacts, permission: "granted" };
  } catch {
    return { contacts: [], permission: "unavailable" };
  }
}

/**
 * Cached rows are returned by the hook immediately. This function saves the
 * device scan before doing any network request, then resolves AfuChat matches
 * in the background without changing the original device order.
 */
export async function syncPhoneContacts(
  userId: string | undefined,
  onDeviceContacts?: (contacts: LocalPhoneContact[]) => void,
  onUpdatedContacts?: (contacts: LocalPhoneContact[]) => void,
): Promise<"granted" | "denied" | "unavailable"> {
  const result = await readDevicePhoneContacts();
  if (result.permission !== "granted") return result.permission;

  await saveDevicePhoneContacts(result.contacts);
  const local = await getLocalPhoneContacts();
  onDeviceContacts?.(local);
  if (!userId || !isOnline()) return "granted";

  try {
    const phones = [...new Set(result.contacts.map((contact) => contact.normalized_phone))];
    const matches = [];
    for (let index = 0; index < phones.length; index += 100) {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, display_name, handle, avatar_url, bio, acoin, is_verified, is_organization_verified, phone_number",
        )
        .in("phone_number", phones.slice(index, index + 100))
        .neq("id", userId);
      if (error) return "granted";
      if (data) matches.push(...data);
    }

    await replacePhoneContactMatches(
      matches.map((profile: any) => ({
        normalized_phone: normalizePhoneNumber(profile.phone_number),
        user_id: profile.id,
        display_name: profile.display_name ?? "",
        handle: profile.handle ?? "",
        avatar_url: profile.avatar_url ?? null,
        bio: profile.bio ?? null,
        acoin: Number(profile.acoin ?? 0),
        is_verified: !!profile.is_verified,
        is_organization_verified: !!profile.is_organization_verified,
      })),
    );
    onUpdatedContacts?.(await getLocalPhoneContacts());
  } catch {
    // The device scan is already cached; matching is best-effort.
  }
  return "granted";
}

export async function sendPhoneInvite(name: string, phone: string): Promise<void> {
  const message = AFUCHAT_INVITE_MESSAGE(name);
  try {
    const smsUrl = `sms:${phone}?body=${encodeURIComponent(message)}`;
    if (await Linking.canOpenURL(smsUrl)) {
      await Linking.openURL(smsUrl);
      return;
    }
  } catch {}
  await Share.share({ message, title: "Join AfuChat" });
}