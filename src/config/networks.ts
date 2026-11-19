export type EvmNetwork = {
  chainId: number;
  name: string;
  shortName: string;
  symbol: string;
  explorer: string;
  rpcEnvKey: string;
  /** Test networks are the only networks where TREX will sign or send. */
  testnet: boolean;
};

export const NETWORKS: EvmNetwork[] = [
  { chainId: 1, name: "Ethereum", shortName: "ETH", symbol: "ETH", explorer: "https://etherscan.io", rpcEnvKey: "EXPO_PUBLIC_ETHEREUM_RPC_URL", testnet: false },
  { chainId: 8453, name: "Base", shortName: "BASE", symbol: "ETH", explorer: "https://basescan.org", rpcEnvKey: "EXPO_PUBLIC_BASE_RPC_URL", testnet: false },
  { chainId: 56, name: "BNB Smart Chain", shortName: "BNB", symbol: "BNB", explorer: "https://bscscan.com", rpcEnvKey: "EXPO_PUBLIC_BNB_RPC_URL", testnet: false },
  { chainId: 42161, name: "Arbitrum One", shortName: "ARB", symbol: "ETH", explorer: "https://arbiscan.io", rpcEnvKey: "EXPO_PUBLIC_ARBITRUM_RPC_URL", testnet: false },
  { chainId: 10, name: "Optimism", shortName: "OP", symbol: "ETH", explorer: "https://optimistic.etherscan.io", rpcEnvKey: "EXPO_PUBLIC_OPTIMISM_RPC_URL", testnet: false },
  { chainId: 137, name: "Polygon", shortName: "POL", symbol: "POL", explorer: "https://polygonscan.com", rpcEnvKey: "EXPO_PUBLIC_POLYGON_RPC_URL", testnet: false },
  { chainId: 11155111, name: "Ethereum Sepolia", shortName: "SEP", symbol: "ETH", explorer: "https://sepolia.etherscan.io", rpcEnvKey: "EXPO_PUBLIC_SEPOLIA_RPC_URL", testnet: true },
  { chainId: 84532, name: "Base Sepolia", shortName: "BSEP", symbol: "ETH", explorer: "https://sepolia.basescan.org", rpcEnvKey: "EXPO_PUBLIC_BASE_SEPOLIA_RPC_URL", testnet: true },
  { chainId: 46630, name: "Robinhood Chain Testnet", shortName: "RHT", symbol: "ETH", explorer: "https://explorer.testnet.chain.robinhood.com", rpcEnvKey: "EXPO_PUBLIC_ROBINHOOD_TESTNET_RPC_URL", testnet: true }
];

// Start on a test network so first-time testing cannot accidentally spend mainnet funds.
export const DEFAULT_NETWORK = NETWORKS.find((network) => network.chainId === 84532) ?? NETWORKS[1];

/**
 * Free public RPC endpoints, tried in order with automatic fallback (see wallet/rpcPool).
 * Each was checked with eth_chainId + eth_getBalance on 2026-11-19. RPC operators can see
 * the public address and requests. cloudflare-eth.com (Ethereum) and polygon-rpc.com
 * (Polygon) were removed: both returned errors for every request.
 */
export const PUBLIC_RPCS: Record<number, string[]> = {
  1: ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org", "https://1rpc.io/eth"],
  8453: ["https://base-rpc.publicnode.com", "https://mainnet.base.org", "https://base.drpc.org", "https://1rpc.io/base"],
  56: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.binance.org", "https://bsc.drpc.org", "https://1rpc.io/bnb"],
  42161: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc", "https://arbitrum.drpc.org", "https://1rpc.io/arb"],
  10: ["https://optimism-rpc.publicnode.com", "https://mainnet.optimism.io", "https://optimism.drpc.org", "https://1rpc.io/op"],
  137: ["https://polygon-bor-rpc.publicnode.com", "https://polygon.drpc.org", "https://1rpc.io/matic"],
  11155111: ["https://ethereum-sepolia-rpc.publicnode.com", "https://1rpc.io/sepolia"],
  84532: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com", "https://base-sepolia.drpc.org"],
  46630: ["https://rpc.testnet.chain.robinhood.com"]
};

/** First public endpoint per chain (kept for callers that only need to know a chain is configured). */
export const PUBLIC_RPC: Record<number, string> = Object.fromEntries(Object.entries(PUBLIC_RPCS).map(([id, urls]) => [id, urls[0]]));

// Expo only inlines EXPO_PUBLIC_* variables referenced literally, so keep this map explicit.
const RPC_OVERRIDES: Record<number, string | undefined> = {
  1: process.env.EXPO_PUBLIC_ETHEREUM_RPC_URL,
  8453: process.env.EXPO_PUBLIC_BASE_RPC_URL,
  56: process.env.EXPO_PUBLIC_BNB_RPC_URL,
  42161: process.env.EXPO_PUBLIC_ARBITRUM_RPC_URL,
  10: process.env.EXPO_PUBLIC_OPTIMISM_RPC_URL,
  137: process.env.EXPO_PUBLIC_POLYGON_RPC_URL,
  11155111: process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL,
  84532: process.env.EXPO_PUBLIC_BASE_SEPOLIA_RPC_URL,
  46630: process.env.EXPO_PUBLIC_ROBINHOOD_TESTNET_RPC_URL
};

/** All endpoints for a chain: a build-time override first, then the public list, de-duplicated. */
export function rpcUrlsFor(chainId: number): string[] {
  const urls = [RPC_OVERRIDES[chainId]?.trim(), ...(PUBLIC_RPCS[chainId] ?? [])].filter((url): url is string => !!url);
  const unique = [...new Set(urls)];
  if (unique.length === 0) throw new Error("No RPC endpoint is configured for this network.");
  return unique;
}

/** Primary endpoint for a chain. Prefer wallet/rpcPool, which falls back across endpoints. */
export function rpcUrlFor(chainId: number): string {
  return rpcUrlsFor(chainId)[0];
}

export function networkByChainId(chainId: number): EvmNetwork | undefined {
  return NETWORKS.find((network) => network.chainId === chainId);
}

export function isTestnet(chainId: number): boolean {
  return networkByChainId(chainId)?.testnet === true;
}

export const MAINNET_SIGNING_TITLE = "Mainnet sending is coming soon";
export const MAINNET_SIGNING_BLOCKED_MESSAGE =
  "Your mainnet balances and tokens work, and you can connect to apps. While TREX is in early testing it only signs on test networks (Sepolia, Base Sepolia and Robinhood Testnet), so nothing can leave your wallet on mainnet by mistake. Switch to a testnet to try sending.";

/** Throws unless the chain is a supported test network. Used before every signature. */
export function assertSigningAllowed(chainId: number): void {
  if (!isTestnet(chainId)) throw new Error(MAINNET_SIGNING_BLOCKED_MESSAGE);
}
