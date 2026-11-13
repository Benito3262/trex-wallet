import { formatEther, JsonRpcProvider } from "ethers";
import { EvmNetwork } from "../config/networks";

const PUBLIC_RPC: Record<number, string> = {
  1: "https://cloudflare-eth.com",
  8453: "https://mainnet.base.org",
  56: "https://bsc-dataseed.binance.org",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
  137: "https://polygon-rpc.com"
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
  const rpcUrl = process.env[network.rpcEnvKey] || PUBLIC_RPC[network.chainId];
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
