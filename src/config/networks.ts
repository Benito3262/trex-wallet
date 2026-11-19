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

/** Public fallback RPC endpoints. RPC operators can see the public address and requests. */
export const PUBLIC_RPC: Record<number, string> = {
  1: "https://cloudflare-eth.com",
  8453: "https://mainnet.base.org",
  56: "https://bsc-dataseed.binance.org",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
  137: "https://polygon-rpc.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  84532: "https://sepolia.base.org",
  46630: "https://rpc.testnet.chain.robinhood.com"
};

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

export function rpcUrlFor(chainId: number): string {
  const url = RPC_OVERRIDES[chainId] || PUBLIC_RPC[chainId];
  if (!url) throw new Error("No RPC endpoint is configured for this network.");
  return url;
}

export function networkByChainId(chainId: number): EvmNetwork | undefined {
  return NETWORKS.find((network) => network.chainId === chainId);
}

export function isTestnet(chainId: number): boolean {
  return networkByChainId(chainId)?.testnet === true;
}

export const MAINNET_SIGNING_BLOCKED_MESSAGE =
  "Mainnet signing is disabled in this early test build. TREX can read balances and connect to sites on mainnet, but it will only sign on Ethereum Sepolia, Base Sepolia or Robinhood Chain Testnet.";

/** Throws unless the chain is a supported test network. Used before every signature. */
export function assertSigningAllowed(chainId: number): void {
  if (!isTestnet(chainId)) throw new Error(MAINNET_SIGNING_BLOCKED_MESSAGE);
}
