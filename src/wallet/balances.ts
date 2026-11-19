import { formatEther, JsonRpcProvider } from "ethers";
import { rpcUrlFor, type EvmNetwork } from "../config/networks";

/**
 * Read-only native balance query. The RPC operator can observe the queried
 * public address and network. Use a trusted RPC or a self-hosted endpoint
 * for stronger privacy; this function never receives private key material.
 */
export async function getNativeBalance(
  network: EvmNetwork,
  address: string
): Promise<string> {
  const rpcUrl = rpcUrlFor(network.chainId);

  const provider = new JsonRpcProvider(rpcUrl, network.chainId, { staticNetwork: true });
  try {
    const chainHex = await provider.send("eth_chainId", []);
    if (Number(BigInt(chainHex)) !== network.chainId) {
      throw new Error("RPC chain mismatch. Balance lookup was stopped.");
    }
    const balance = await provider.getBalance(address);
    return Number(formatEther(balance)).toLocaleString("en-US", {
      maximumFractionDigits: 6
    });
  } finally {
    provider.destroy();
  }
}
