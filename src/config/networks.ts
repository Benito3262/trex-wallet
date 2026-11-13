export type EvmNetwork = {
  chainId: number;
  name: string;
  shortName: string;
  symbol: string;
  explorer: string;
  rpcEnvKey: string;
};

export const NETWORKS: EvmNetwork[] = [
  { chainId: 1, name: "Ethereum", shortName: "ETH", symbol: "ETH", explorer: "https://etherscan.io", rpcEnvKey: "EXPO_PUBLIC_ETHEREUM_RPC_URL" },
  { chainId: 8453, name: "Base", shortName: "BASE", symbol: "ETH", explorer: "https://basescan.org", rpcEnvKey: "EXPO_PUBLIC_BASE_RPC_URL" },
  { chainId: 56, name: "BNB Smart Chain", shortName: "BNB", symbol: "BNB", explorer: "https://bscscan.com", rpcEnvKey: "EXPO_PUBLIC_BNB_RPC_URL" },
  { chainId: 42161, name: "Arbitrum One", shortName: "ARB", symbol: "ETH", explorer: "https://arbiscan.io", rpcEnvKey: "EXPO_PUBLIC_ARBITRUM_RPC_URL" },
  { chainId: 10, name: "Optimism", shortName: "OP", symbol: "ETH", explorer: "https://optimistic.etherscan.io", rpcEnvKey: "EXPO_PUBLIC_OPTIMISM_RPC_URL" },
  { chainId: 137, name: "Polygon", shortName: "POL", symbol: "POL", explorer: "https://polygonscan.com", rpcEnvKey: "EXPO_PUBLIC_POLYGON_RPC_URL" }
];

export const DEFAULT_NETWORK = NETWORKS[1];
