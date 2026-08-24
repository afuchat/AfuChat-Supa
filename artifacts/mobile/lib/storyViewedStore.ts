/**
 * Module-level store that tracks which userId story groups have been fully
 * viewed. The set is persisted so unread/read ordering remains correct after
 * restarting the app or opening stories while offline.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const _viewedUserIds = new Set<string>();
const _listeners = new Set<() => void>();
const VIEWED_STORIES_KEY = "@afuchat:viewed-story-users";
let _hydrated = false;

function notify() {
  _listeners.forEach((fn) => fn());
}

export function markStoriesViewed(userId: string): void {
  if (!_viewedUserIds.has(userId)) {
    _viewedUserIds.add(userId);
    AsyncStorage.setItem(VIEWED_STORIES_KEY, JSON.stringify(Array.from(_viewedUserIds))).catch(() => {});
    notify();
  }
}

export async function hydrateViewedUsers(): Promise<void> {
  if (_hydrated) return;
  _hydrated = true;
  try {
    const raw = await AsyncStorage.getItem(VIEWED_STORIES_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    if (Array.isArray(ids)) {
      ids.filter((id): id is string => typeof id === "string").forEach((id) => _viewedUserIds.add(id));
      notify();
    }
  } catch {
    // A corrupt or unavailable local cache must not block the stories rail.
  }
}

export function getViewedUserIds(): ReadonlySet<string> {
  return _viewedUserIds;
}

export function subscribeStoryViewed(fn: () => void): () => void {
  _listeners.add(fn);
  return () => {
    _listeners.delete(fn);
  };
}
