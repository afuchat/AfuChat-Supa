/**
 * navigateToProfile — canonical username navigation for mention taps.
 *
 * Every username tap goes through /[handle].tsx. That route owns the
 * skeleton, exact profile/channel/group resolution, and denied-state feedback.
 * Keeping this path unified also means a channel or group username in text
 * cannot be mistaken for a missing profile.
 */

import { router } from "expo-router";

export async function navigateToProfile(
  handle: string,
  _isLoggedIn: boolean
): Promise<void> {
  const clean = handle.replace(/^@/, "").toLowerCase();
  router.push(`/@${clean}` as any);
}
