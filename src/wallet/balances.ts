import { formatEther, JsonRpcProvider } from "ethers";
import type { EvmNetwork } from "../config/networks";

const RPC_OVERRIDES: Record<number, string | undefined> = {
  1: process.env.EXPO_PUBLIC_ETHEREUM_RPC_URL,
  8453: process.env.EXPO_PUBLIC_BASE_RPC_URL,
  56: process.env.EXPO_PUBLIC_BNB_RPC_URL,
  42161: process.env.EXPO_PUBLIC_ARBITRUM_RPC_URL,
  10: process.env.EXPO_PUBLIC_OPTIMISM_RPC_URL,
  137: process.env.EXPO_PUBLIC_POLYGON_RPC_URL,
  11155111: process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL,
  84532: process.env.EXPO_PUBLIC_BASE_SEPOLIA_RPC_URL
};

const PUBLIC_RPC: Record<number, string> = {
  1: "https://cloudflare-eth.com",
  8453: "https://mainnet.base.org",
  56: "https://bsc-dataseed.binance.org",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
  137: "https://polygon-rpc.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  84532: "https://sepolia.base.org"
};

/**
 * Read-only native balance query. The RPC operator can observe the queried
 * public address and network. Use a trusted RPC or a self-hosted endpoint
 * for stronger privacy; this function never receives private key material.
 */
export async function getNativeBalance(
  network: EvmNetwork,
  address: string
): Promise<string> {
  const rpcUrl = RPC_OVERRIDES[network.chainId] || PUBLIC_RPC[network.chainId];
  if (!rpcUrl) throw new Error("No RPC endpoint is configured for this network.");

  const provider = new JsonRpcProvider(rpcUrl, network.chainId, { staticNetwork: true });
  try {
    const balance = await provider.getBalance(address);
    return Number(formatEther(balance)).toLocaleString("en-US", {
      maximumFractionDigits: 6
    });
  } finally {
    provider.destroy();
  }
}
