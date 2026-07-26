/**
 * groupInvite.ts
 *
 * Utilities for generating and parsing group/channel invite links.
 *
 * Invite code = encodeId(chatId) -- a base-62 encoding of the chat UUID.
 * This is deterministic and requires no database column.
 *
 * Link format: https://<domain>/join/<code>
 * Deep link:   afuchat://join/<code>
 */

import { encodeId, decodeId, isEncodedId, isUuid } from "./shortId";
import { APP_DOMAIN } from "./env";

/** Generate a shareable invite link for a group chat. */
export function generateGroupInviteLink(chatId: string): string {
  const normalizedChatId = normalizeChatId(chatId);
  if (!normalizedChatId) return "";
  const code = encodeId(normalizedChatId);
  return `https://${APP_DOMAIN}/join/${code}`;
}

/** Generate just the short invite code for a chat UUID. */
export function generateInviteCode(chatId: string): string {
  const normalizedChatId = normalizeChatId(chatId);
  return normalizedChatId ? encodeId(normalizedChatId) : "";
}

/**
 * Chat routes normally carry a raw UUID, but stale/deep-linked routes can
 * carry an already encoded ID. Normalize both forms before encoding so an
 * invalid route value never reaches the BigInt conversion.
 */
function normalizeChatId(chatId: string): string | null {
  const value = String(chatId ?? "").trim();
  if (isUuid(value)) return value;
  if (!isEncodedId(value)) return null;
  const decoded = decodeId(value);
  return isUuid(decoded) ? decoded : null;
}

/**
 * Parse an invite code (shortId or raw UUID) back to a chat UUID.
 * Returns null if the code is invalid.
 */
export function parseInviteCode(code: string): string | null {
  if (!code) return null;
  if (isUuid(code)) return code;
  if (isEncodedId(code)) {
    try {
      const decoded = decodeId(code);
      return isUuid(decoded) ? decoded : null;
    } catch {
      return null;
    }
  }
  return null;
}
