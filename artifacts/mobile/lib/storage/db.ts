// ─── AfuChat Local Database — Web stub ──────────────────────────────────────
// Metro resolves lib/storage/db.native.ts for Android/iOS builds automatically
// (the .native.ts extension takes priority). This file is the web fallback:
// it exports a no-op DB so the app shell can render without SQLite.
// All local-storage features (cached conversations, offline messages, etc.)
// are simply no-ops on web.

export type DB = {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: any[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T = any>(sql: string, params?: any[]): Promise<T[]>;
  getFirstAsync<T = any>(sql: string, params?: any[]): Promise<T | null>;
};

const noopDB: DB = {
  execAsync: async () => {},
  runAsync: async () => ({ lastInsertRowId: 0, changes: 0 }),
  getAllAsync: async () => [],
  getFirstAsync: async () => null,
};

export async function getDB(): Promise<DB> {
  return noopDB;
}
