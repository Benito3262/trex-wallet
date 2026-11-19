import * as SQLite from "expo-sqlite";
import { JsonRpcProvider } from "ethers";
import { NETWORKS, PUBLIC_RPC, rpcUrlFor } from "../config/networks";

export type WalletTransaction = {
  hash: string;
  chainId: number;
  networkName: string;
  symbol: string;
  amount: string;
  toAddress: string;
  fromAddress: string;
  createdAt: string;
  status: "submitted" | "included" | "failed";
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

export async function getRecentTransactions(limit = 50, walletAddress?: string): Promise<WalletTransaction[]> {
  const db = await database();
  const safeLimit = Math.max(1, Math.min(limit, 100));
  if (walletAddress) {
    return db.getAllAsync<WalletTransaction>(
      `SELECT hash, chain_id as chainId, network_name as networkName, symbol, amount,
        to_address as toAddress, from_address as fromAddress, created_at as createdAt, status
        FROM wallet_transactions WHERE lower(from_address) = lower(?)
        ORDER BY created_at DESC LIMIT ?`,
      walletAddress,
      safeLimit
    );
  }
  return db.getAllAsync<WalletTransaction>(
    `SELECT hash, chain_id as chainId, network_name as networkName, symbol, amount,
      to_address as toAddress, from_address as fromAddress, created_at as createdAt, status
      FROM wallet_transactions ORDER BY created_at DESC LIMIT ?`,
    safeLimit
  );
}

/** Refresh a small recent window; "included" means mined, not final settlement. */
export async function refreshRecentTransactions(walletAddress?: string): Promise<WalletTransaction[]> {
  const items = await getRecentTransactions(20, walletAddress);
  for (const tx of items) {
    if (tx.status !== "submitted") continue;
    const network = NETWORKS.find((item) => item.chainId === tx.chainId);
    const rpc = PUBLIC_RPC[tx.chainId] ? rpcUrlFor(tx.chainId) : null;
    if (!network || !rpc) continue;

    const provider = new JsonRpcProvider(rpc, tx.chainId, { staticNetwork: true });
    try {
      const chainHex = await provider.send("eth_chainId", []);
      if (Number(BigInt(chainHex)) !== tx.chainId) continue;
      const receipt = await provider.getTransactionReceipt(tx.hash);
      if (receipt) {
        const status = receipt.status === 1 ? "included" : "failed";
        const db = await database();
        await db.runAsync(
          "UPDATE wallet_transactions SET status = ? WHERE hash = ?",
          status,
          tx.hash
        );
      }
    } catch {
      // Keep the prior submitted state when an RPC provider is unavailable.
    } finally {
      provider.destroy();
    }
  }
  return getRecentTransactions(50, walletAddress);
}
