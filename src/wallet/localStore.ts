import * as SQLite from "expo-sqlite";

/**
 * Local, public-only metadata: connected sites, approvals granted through
 * TREX and addresses each account has interacted with. No keys or phrases.
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const database = await SQLite.openDatabaseAsync("trex-dapps.db");
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS connections (
          origin TEXT NOT NULL,
          address TEXT NOT NULL,
          source TEXT NOT NULL,
          name TEXT,
          connected_at TEXT NOT NULL,
          PRIMARY KEY (origin, address)
        );
        CREATE TABLE IF NOT EXISTS approvals (
          owner TEXT NOT NULL,
          chain_id INTEGER NOT NULL,
          token TEXT NOT NULL,
          spender TEXT NOT NULL,
          kind TEXT NOT NULL,
          origin TEXT,
          tx_hash TEXT,
          updated_at TEXT NOT NULL,
          PRIMARY KEY (owner, chain_id, token, spender, kind)
        );
        CREATE TABLE IF NOT EXISTS interactions (
          owner TEXT NOT NULL,
          chain_id INTEGER NOT NULL,
          target TEXT NOT NULL,
          first_seen TEXT NOT NULL,
          PRIMARY KEY (owner, chain_id, target)
        );
      `);
      return database;
    })().catch((error) => { dbPromise = null; throw error; });
  }
  return dbPromise;
}

export type Connection = { origin: string; address: string; source: string; name: string | null; connectedAt: string };

export async function listConnections(address?: string): Promise<Connection[]> {
  const database = await db();
  const rows = address
    ? await database.getAllAsync<Connection>("SELECT origin, address, source, name, connected_at as connectedAt FROM connections WHERE address = ? ORDER BY connected_at DESC", address.toLowerCase())
    : await database.getAllAsync<Connection>("SELECT origin, address, source, name, connected_at as connectedAt FROM connections ORDER BY connected_at DESC");
  return rows;
}

export async function addConnection(origin: string, address: string, source: string, name?: string): Promise<void> {
  const database = await db();
  await database.runAsync(
    "INSERT OR REPLACE INTO connections (origin, address, source, name, connected_at) VALUES (?, ?, ?, ?, ?)",
    origin, address.toLowerCase(), source, name ?? null, new Date().toISOString()
  );
}

export async function removeConnection(origin: string, address?: string): Promise<void> {
  const database = await db();
  if (address) await database.runAsync("DELETE FROM connections WHERE origin = ? AND address = ?", origin, address.toLowerCase());
  else await database.runAsync("DELETE FROM connections WHERE origin = ?", origin);
}

export type ApprovalKind = "erc20" | "permit2" | "nft-all";
export type TrackedApproval = { owner: string; chainId: number; token: string; spender: string; kind: ApprovalKind; origin: string | null; txHash: string | null; updatedAt: string };

export async function trackApproval(entry: Omit<TrackedApproval, "updatedAt">): Promise<void> {
  const database = await db();
  await database.runAsync(
    "INSERT OR REPLACE INTO approvals (owner, chain_id, token, spender, kind, origin, tx_hash, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    entry.owner.toLowerCase(), entry.chainId, entry.token.toLowerCase(), entry.spender.toLowerCase(), entry.kind, entry.origin, entry.txHash, new Date().toISOString()
  );
}

export async function listApprovals(owner: string, chainId: number): Promise<TrackedApproval[]> {
  const database = await db();
  return database.getAllAsync<TrackedApproval>(
    "SELECT owner, chain_id as chainId, token, spender, kind, origin, tx_hash as txHash, updated_at as updatedAt FROM approvals WHERE owner = ? AND chain_id = ? ORDER BY updated_at DESC",
    owner.toLowerCase(), chainId
  );
}

export async function forgetApproval(entry: Pick<TrackedApproval, "owner" | "chainId" | "token" | "spender" | "kind">): Promise<void> {
  const database = await db();
  await database.runAsync(
    "DELETE FROM approvals WHERE owner = ? AND chain_id = ? AND token = ? AND spender = ? AND kind = ?",
    entry.owner.toLowerCase(), entry.chainId, entry.token.toLowerCase(), entry.spender.toLowerCase(), entry.kind
  );
}

export async function hasInteracted(owner: string, chainId: number, target: string): Promise<boolean> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) as n FROM interactions WHERE owner = ? AND chain_id = ? AND target = ?",
    owner.toLowerCase(), chainId, target.toLowerCase()
  );
  return (row?.n ?? 0) > 0;
}

export async function recordInteraction(owner: string, chainId: number, target: string): Promise<void> {
  const database = await db();
  await database.runAsync(
    "INSERT OR IGNORE INTO interactions (owner, chain_id, target, first_seen) VALUES (?, ?, ?, ?)",
    owner.toLowerCase(), chainId, target.toLowerCase(), new Date().toISOString()
  );
}
