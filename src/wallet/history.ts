import * as SQLite from "expo-sqlite";
import { JsonRpcProvider } from "ethers";
import { NETWORKS } from "../config/networks";

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

export async function getRecentTransactions(limit = 50): Promise<WalletTransaction[]> {
  const db = await database();
  return db.getAllAsync<WalletTransaction>(
    `SELECT hash, chain_id as chainId, network_name as networkName, symbol, amount,
      to_address as toAddress, from_address as fromAddress, created_at as createdAt, status
      FROM wallet_transactions ORDER BY created_at DESC LIMIT ?`,
    Math.max(1, Math.min(limit, 100))
  );
}

const HISTORY_RPC: Record<number, string> = {
  1: "https://cloudflare-eth.com",
  8453: "https://mainnet.base.org",
  56: "https://bsc-dataseed.binance.org",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
  137: "https://polygon-rpc.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  84532: "https://sepolia.base.org"
};

const HISTORY_RPC_OVERRIDE: Record<number, string | undefined> = {
  1: process.env.EXPO_PUBLIC_ETHEREUM_RPC_URL,
  8453: process.env.EXPO_PUBLIC_BASE_RPC_URL,
  56: process.env.EXPO_PUBLIC_BNB_RPC_URL,
  42161: process.env.EXPO_PUBLIC_ARBITRUM_RPC_URL,
  10: process.env.EXPO_PUBLIC_OPTIMISM_RPC_URL,
  137: process.env.EXPO_PUBLIC_POLYGON_RPC_URL,
  11155111: process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL,
  84532: process.env.EXPO_PUBLIC_BASE_SEPOLIA_RPC_URL
};

/** Refresh a small recent window; "included" means mined, not final settlement. */
export async function refreshRecentTransactions(): Promise<WalletTransaction[]> {
  const items = await getRecentTransactions(20);
  for (const tx of items) {
    if (tx.status !== "submitted") continue;
    const network = NETWORKS.find((item) => item.chainId === tx.chainId);
    const rpc = HISTORY_RPC_OVERRIDE[tx.chainId] || HISTORY_RPC[tx.chainId];
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
  return getRecentTransactions();
}
