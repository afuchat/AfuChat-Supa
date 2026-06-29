// ─── Chat Folders — Permanent SQLite Store ────────────────────────────────────
// User-defined chat category folders persist in SQLite (documentDirectory).
// They survive app restarts, device reboots, and "Clear Data" — never in cache.
//
// Migration: on first call after upgrade, any folders in AsyncStorage
// ("chat_folders_v1") are imported into SQLite and the key is deleted so the
// migration never runs again.
//
// On web: the DB is a no-op stub (app is mobile-only). An in-memory array is
// used as a session-scoped fallback so the UI still works in the web preview.

import { Platform } from "react-native";
import { getDB } from "./db";

export type FolderFilter = "personal" | "groups" | "channels" | "unread";

export type ChatFolder = {
  id: string;
  name: string;
  icon: string;
  filter: FolderFilter;
  createdAt: number;
};

// ─── Web in-memory fallback ────────────────────────────────────────────────────

let _webFolders: ChatFolder[] = [];

// ─── One-time migration from AsyncStorage → SQLite ─────────────────────────────

const LEGACY_AS_KEY = "chat_folders_v1";
const MIGRATED_MMKV_KEY = "chat_folders_migrated_v1";

async function migrateFromAsyncStorage(): Promise<void> {
  try {
    const { storage } = await import("./mmkv");
    if (storage.getBoolean(MIGRATED_MMKV_KEY)) return;
    storage.setBoolean(MIGRATED_MMKV_KEY, true);

    const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
    const raw = await AsyncStorage.getItem(LEGACY_AS_KEY);
    if (!raw) return;

    const legacyFolders: ChatFolder[] = JSON.parse(raw);
    if (!Array.isArray(legacyFolders) || legacyFolders.length === 0) return;

    const db = await getDB();
    for (let i = 0; i < legacyFolders.length; i++) {
      const f = legacyFolders[i];
      await db.runAsync(
        `INSERT OR IGNORE INTO chat_folders (id, name, icon, filter, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [f.id, f.name, f.icon, f.filter, i, f.createdAt ?? Date.now()],
      );
    }

    await AsyncStorage.removeItem(LEGACY_AS_KEY);
  } catch {}
}

// ─── Public API ────────────────────────────────────────────────────────────────

export async function loadFolders(): Promise<ChatFolder[]> {
  if (Platform.OS === "web") return [..._webFolders];
  try {
    await migrateFromAsyncStorage();
    const db = await getDB();
    const rows = await db.getAllAsync<any>(
      "SELECT * FROM chat_folders ORDER BY sort_order ASC, created_at ASC",
    );
    return rows.map(rowToFolder);
  } catch {
    return [];
  }
}

export async function saveFolders(folders: ChatFolder[]): Promise<void> {
  if (Platform.OS === "web") {
    _webFolders = [...folders];
    return;
  }
  try {
    const db = await getDB();
    await db.execAsync("DELETE FROM chat_folders");
    for (let i = 0; i < folders.length; i++) {
      const f = folders[i];
      await db.runAsync(
        `INSERT OR REPLACE INTO chat_folders (id, name, icon, filter, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [f.id, f.name, f.icon, f.filter, i, f.createdAt ?? Date.now()],
      );
    }
  } catch {}
}

export async function createFolder(
  data: Omit<ChatFolder, "id" | "createdAt">,
): Promise<ChatFolder> {
  const folder: ChatFolder = {
    ...data,
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    createdAt: Date.now(),
  };
  if (Platform.OS === "web") {
    _webFolders = [..._webFolders, folder];
    return folder;
  }
  try {
    const db = await getDB();
    const countRow = await db.getFirstAsync<{ c: number }>("SELECT COUNT(*) as c FROM chat_folders");
    const sortOrder = countRow?.c ?? 0;
    await db.runAsync(
      `INSERT OR REPLACE INTO chat_folders (id, name, icon, filter, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [folder.id, folder.name, folder.icon, folder.filter, sortOrder, folder.createdAt],
    );
  } catch {}
  return folder;
}

export async function updateFolder(
  id: string,
  updates: Partial<Pick<ChatFolder, "name" | "icon" | "filter">>,
): Promise<void> {
  if (Platform.OS === "web") {
    _webFolders = _webFolders.map((f) =>
      f.id === id ? { ...f, ...updates } : f,
    );
    return;
  }
  try {
    const db = await getDB();
    if (updates.name !== undefined) {
      await db.runAsync("UPDATE chat_folders SET name = ? WHERE id = ?", [updates.name, id]);
    }
    if (updates.icon !== undefined) {
      await db.runAsync("UPDATE chat_folders SET icon = ? WHERE id = ?", [updates.icon, id]);
    }
    if (updates.filter !== undefined) {
      await db.runAsync("UPDATE chat_folders SET filter = ? WHERE id = ?", [updates.filter, id]);
    }
  } catch {}
}

export async function deleteFolder(id: string): Promise<void> {
  if (Platform.OS === "web") {
    _webFolders = _webFolders.filter((f) => f.id !== id);
    return;
  }
  try {
    const db = await getDB();
    await db.runAsync("DELETE FROM chat_folders WHERE id = ?", [id]);
  } catch {}
}

/** Delete ALL folders for the signed-in user. Called on account switch/sign-out. */
export async function clearAllFolders(): Promise<void> {
  if (Platform.OS === "web") {
    _webFolders = [];
    return;
  }
  try {
    const db = await getDB();
    await db.execAsync("DELETE FROM chat_folders");
  } catch {}
}

// ─── Internal ──────────────────────────────────────────────────────────────────

function rowToFolder(r: any): ChatFolder {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    filter: r.filter as FolderFilter,
    createdAt: r.created_at,
  };
}
