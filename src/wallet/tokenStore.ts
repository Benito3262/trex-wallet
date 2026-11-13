import * as SQLite from "expo-sqlite";
import type { TokenMetadata } from "./tokens";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync("trex-tokens.db");
  const db = await dbPromise;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS custom_tokens (
      chain_id INTEGER NOT NULL,
      contract_address TEXT NOT NULL,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      decimals INTEGER NOT NULL,
      PRIMARY KEY (chain_id, contract_address)
    );
  `);
  return db;
}

export async function saveCustomToken(token: TokenMetadata): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT OR REPLACE INTO custom_tokens
      (chain_id, contract_address, name, symbol, decimals)
      VALUES (?, ?, ?, ?, ?)`,
    token.chainId,
    token.contractAddress.toLowerCase(),
    token.name,
    token.symbol,
    token.decimals
  );
}

export async function getCustomTokens(chainId: number): Promise<TokenMetadata[]> {
  const db = await database();
  return db.getAllAsync<TokenMetadata>(
    `SELECT chain_id as chainId, contract_address as contractAddress, name, symbol, decimals
      FROM custom_tokens WHERE chain_id = ? ORDER BY symbol COLLATE NOCASE`,
    chainId
  );
}

export async function removeCustomToken(chainId: number, contractAddress: string): Promise<void> {
  const db = await database();
  await db.runAsync(
    "DELETE FROM custom_tokens WHERE chain_id = ? AND contract_address = ?",
    chainId,
    contractAddress.toLowerCase()
  );
}
