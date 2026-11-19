import { formatUnits } from "ethers";
import type { EvmNetwork } from "../config/networks";

export type ExplorerActivity = {
  hash: string;
  chainId: number;
  networkName: string;
  symbol: string;
  amount: string;
  fromAddress: string;
  toAddress: string;
  timestamp: string;
  direction: "sent" | "received";
  kind: "native" | "token";
  status: "confirmed" | "failed" | "pending";
  tokenAddress?: string;
};

const EXPLORER_API: Record<number, string> = {
  1: "https://eth.blockscout.com/api/v2",
  8453: "https://base.blockscout.com/api/v2",
  42161: "https://arbitrum.blockscout.com/api/v2",
  10: "https://optimism.blockscout.com/api/v2",
  137: "https://polygon.blockscout.com/api/v2",
  11155111: "https://eth-sepolia.blockscout.com/api/v2",
  84532: "https://base-sepolia.blockscout.com/api/v2",
  46630: "https://explorer.testnet.chain.robinhood.com/api/v2"
};

function asAddress(value: any): string {
  if (typeof value === "string") return value;
  return typeof value?.hash === "string" ? value.hash : "";
}

function asTimestamp(value: unknown): string {
  if (typeof value !== "string") return new Date().toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

async function getItems(url: string): Promise<any[]> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Explorer request failed (${response.status}).`);
  const payload: any = await response.json();
  if (!Array.isArray(payload?.items)) throw new Error("Explorer returned an unexpected activity response.");
  return payload.items;
}

/**
 * Reads public address activity from the chain explorer. No signing material is
 * sent. Explorer coverage varies by chain; unsupported networks report errors.
 */
export async function fetchAddressActivity(network: EvmNetwork, address: string): Promise<ExplorerActivity[]> {
  const base = EXPLORER_API[network.chainId];
  if (!base) throw new Error("Incoming activity indexing is not configured for this network yet.");
  const normalized = address.toLowerCase();
  const root = `${base}/addresses/${encodeURIComponent(address)}`;
  const [nativeItems, tokenItems] = await Promise.all([
    getItems(`${root}/transactions`),
    getItems(`${root}/token-transfers?type=ERC-20`)
  ]);

  const native: ExplorerActivity[] = nativeItems.map((item: any): ExplorerActivity => {
    const fromAddress = asAddress(item.from);
    const toAddress = asAddress(item.to);
    const direction: "received" | "sent" = toAddress.toLowerCase() === normalized ? "received" : "sent";
    const rawValue = typeof item.value === "string" ? item.value : "0";
    let amount = "0";
    try { amount = formatUnits(BigInt(rawValue), 18); } catch { /* malformed explorer value */ }
    return {
      hash: String(item.hash ?? ""),
      chainId: network.chainId,
      networkName: network.name,
      symbol: network.symbol,
      amount,
      fromAddress,
      toAddress,
      timestamp: asTimestamp(item.timestamp),
      direction,
      kind: "native" as const,
      status: (item.status === "error" || item.result === "error" ? "failed" : "confirmed") as "failed" | "confirmed"
    };
  }).filter((item) => /^0x[0-9a-f]{64}$/i.test(item.hash));

  const tokens: ExplorerActivity[] = tokenItems.map((item: any): ExplorerActivity => {
    const fromAddress = asAddress(item.from);
    const toAddress = asAddress(item.to);
    const direction: "received" | "sent" = toAddress.toLowerCase() === normalized ? "received" : "sent";
    const token = item.token ?? {};
    const decimals = Number.isInteger(Number(token.decimals)) ? Number(token.decimals) : 18;
    let amount = "0";
    try { amount = formatUnits(BigInt(item.total?.value ?? item.total_value ?? "0"), decimals); } catch { /* malformed explorer value */ }
    return {
      hash: String(item.transaction_hash ?? item.tx_hash ?? ""),
      chainId: network.chainId,
      networkName: network.name,
      symbol: String(token.symbol ?? "TOKEN"),
      amount,
      fromAddress,
      toAddress,
      timestamp: asTimestamp(item.timestamp),
      direction,
      kind: "token" as const,
      status: "confirmed" as const,
      tokenAddress: asAddress(token.address)
    };
  }).filter((item) => /^0x[0-9a-f]{64}$/i.test(item.hash));

  const unique = new Map<string, ExplorerActivity>();
  for (const item of [...native, ...tokens]) {
    const key = `${item.hash}:${item.kind}:${item.tokenAddress ?? "native"}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 100);
}

export type IndexedTokenBalance = {
  chainId: number;
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  balance: string;
};

const EXPLORER_TOKEN_BALANCE_API: Record<number, string> = EXPLORER_API;

/**
 * Discover non-zero ERC-20 balances for a public address using the network's
 * Blockscout-compatible address index. This is read-only and never requests keys.
 * Chains without a configured indexer return an empty list for manual fallback.
 */
export async function fetchAddressTokenBalances(
  network: EvmNetwork,
  address: string
): Promise<IndexedTokenBalance[]> {
  const base = EXPLORER_TOKEN_BALANCE_API[network.chainId];
  if (!base) return [];
  const response = await fetch(
    `${base}/addresses/${encodeURIComponent(address)}/token-balances`,
    { headers: { Accept: "application/json" } }
  );
  if (!response.ok) {
    if (response.status === 404 || response.status === 501) return [];
    throw new Error(`Token discovery unavailable (${response.status}).`);
  }
  const payload: any = await response.json();
  const rows: any[] = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
  const discovered: IndexedTokenBalance[] = [];
  for (const row of rows) {
    const token = row?.token ?? row;
    const contractAddress = typeof token?.address === "string" ? token.address : "";
    const symbol = typeof token?.symbol === "string" ? token.symbol.trim() : "";
    const name = typeof token?.name === "string" ? token.name.trim() : symbol;
    const decimals = Number(token?.decimals);
    const rawValue = row?.value ?? row?.balance ?? row?.token?.value;
    if (!/^0x[0-9a-f]{40}$/i.test(contractAddress)) continue;
    if (!symbol || symbol.length > 16 || !Number.isInteger(decimals) || decimals < 0 || decimals > 36) continue;
    try {
      const amount = BigInt(String(rawValue ?? "0"));
      if (amount <= 0n) continue;
      discovered.push({
        chainId: network.chainId,
        contractAddress,
        name: (name || symbol).slice(0, 80),
        symbol,
        decimals,
        balance: formatUnits(amount, decimals)
      });
    } catch {
      // Ignore malformed indexer rows rather than displaying fabricated balances.
    }
  }
  return discovered;
}
