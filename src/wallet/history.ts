import * as SQLite from "expo-sqlite";

export type WalletTransaction = {
  hash: string;
  chainId: number;
  networkName: string;
  symbol: string;
  amount: string;
  toAddress: string;
  fromAddress: string;
  createdAt: string;
  status: "submitted";
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database() {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("trex-wallet.db");
  }
  const db = await databasePromise;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      hash TEXT PRIMARY KEY NOT NULL,
      chain_id INTEGER NOT NULL,
      network_name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      amount TEXT NOT NULL,
      to_address TEXT NOT NULL,
      from_address TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL
    );
  `);
  return db;
}

/** Transaction metadata only. Recovery phrases and private keys never enter this database. */
export async function recordTransaction(tx: WalletTransaction): Promise<void> {
  const db = await database();
  await db.runAsync(
    `INSERT OR REPLACE INTO wallet_transactions
      (hash, chain_id, network_name, symbol, amount, to_address, from_address, created_at, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tx.hash,
    tx.chainId,
    tx.networkName,
    tx.symbol,
    tx.amount,
    tx.toAddress,
    tx.fromAddress,
    tx.createdAt,
    tx.status
  );
}

export async function getRecentTransactions(limit = 50): Promise<WalletTransaction[]> {
  const db = await database();
  return db.getAllAsync<WalletTransaction>(
    `SELECT hash, chain_id as chainId, network_name as networkName, symbol, amount,
      to_address as toAddress, from_address as fromAddress, created_at as createdAt, status
      FROM wallet_transactions ORDER BY created_at DESC LIMIT ?`,
    Math.max(1, Math.min(limit, 100))
  );
}
