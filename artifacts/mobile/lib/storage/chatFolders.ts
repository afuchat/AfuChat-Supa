// ─── Chat Folders ─────────────────────────────────────────────────────────────
// User-defined chat category folders.
//
// Native: persisted in SQLite. Every public function ensures the table exists
// before touching it (self-healing CREATE TABLE IF NOT EXISTS), so the feature
// works even when the migration hasn't run yet in the current app session
// (e.g. Expo Go Fast Refresh keeps the cached DB open at an older schema).
//
// Web: DB is a no-op stub. An in-memory array provides session-scoped storage
// so the web preview works without any persistence.

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

// ─── Ensure table exists (native only) ────────────────────────────────────────
// Called before every DB operation so the table is always ready, regardless of
// whether the schema migration has run in the current session.

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS chat_folders (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    icon        TEXT    NOT NULL,
    filter      TEXT    NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_folders_sort
    ON chat_folders (sort_order ASC, created_at ASC);
`;

async function ensureTable(): Promise<ReturnType<typeof getDB> extends Promise<infer T> ? T : never> {
  const db = await getDB();
  await db.execAsync(CREATE_TABLE_SQL);
  return db as any;
}

// ─── One-time migration from AsyncStorage → SQLite ─────────────────────────────

const LEGACY_AS_KEY   = "chat_folders_v1";
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

    const db = await ensureTable();
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
    const db = await ensureTable();
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
    const db = await ensureTable();
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
    const db = await ensureTable();
    const countRow = await db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM chat_folders",
    );
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
    _webFolders = _webFolders.map((f) => (f.id === id ? { ...f, ...updates } : f));
    return;
  }
  try {
    const db = await ensureTable();
    if (updates.name   !== undefined)
      await db.runAsync("UPDATE chat_folders SET name   = ? WHERE id = ?", [updates.name,   id]);
    if (updates.icon   !== undefined)
      await db.runAsync("UPDATE chat_folders SET icon   = ? WHERE id = ?", [updates.icon,   id]);
    if (updates.filter !== undefined)
      await db.runAsync("UPDATE chat_folders SET filter = ? WHERE id = ?", [updates.filter, id]);
  } catch {}
}

export async function deleteFolder(id: string): Promise<void> {
  if (Platform.OS === "web") {
    _webFolders = _webFolders.filter((f) => f.id !== id);
    return;
  }
  try {
    const db = await ensureTable();
    await db.runAsync("DELETE FROM chat_folders WHERE id = ?", [id]);
  } catch {}
}

export async function clearAllFolders(): Promise<void> {
  if (Platform.OS === "web") {
    _webFolders = [];
    return;
  }
  try {
    const db = await ensureTable();
    await db.execAsync("DELETE FROM chat_folders");
  } catch {}
}

// ─── Internal ──────────────────────────────────────────────────────────────────

function rowToFolder(r: any): ChatFolder {
  return {
    id:        r.id,
    name:      r.name,
    icon:      r.icon,
    filter:    r.filter as FolderFilter,
    createdAt: r.created_at,
  };
}
