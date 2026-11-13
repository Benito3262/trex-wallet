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
  { chainId: 137, name: "Polygon", shortName: "POL", symbol: "POL", explorer: "https://polygonscan.com", rpcEnvKey: "EXPO_PUBLIC_POLYGON_RPC_URL" },
  { chainId: 11155111, name: "Ethereum Sepolia", shortName: "SEP", symbol: "ETH", explorer: "https://sepolia.etherscan.io", rpcEnvKey: "EXPO_PUBLIC_SEPOLIA_RPC_URL" },
  { chainId: 84532, name: "Base Sepolia", shortName: "BSEP", symbol: "ETH", explorer: "https://sepolia.basescan.org", rpcEnvKey: "EXPO_PUBLIC_BASE_SEPOLIA_RPC_URL" }
];

// Start on a test network so first-time testing cannot accidentally spend mainnet funds.
export const DEFAULT_NETWORK = NETWORKS.find((network) => network.chainId === 84532) ?? NETWORKS[1];
