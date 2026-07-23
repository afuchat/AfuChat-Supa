// ─── AfuChat Local Database ─────────────────────────────────────────────────
// Metro resolves lib/storage/db.native.ts for Android/iOS builds.
// This file satisfies the TypeScript compiler only; at runtime the .native.ts
// file is always loaded on device.
export { getDB } from "./db.native";
export type { DB } from "./db.native";
