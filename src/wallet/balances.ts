import { formatEther } from "ethers";
import type { EvmNetwork } from "../config/networks";
import { withProvider } from "./rpcPool";

/**
 * Read-only native balance query, with fallback across public RPCs. The RPC operator can
 * observe the queried public address and network; no private key material is involved.
 */
export async function getNativeBalanceWei(network: EvmNetwork, address: string): Promise<bigint> {
  return withProvider(network, (provider) => provider.getBalance(address));
}

export function formatBalance(wei: bigint, maxDecimals = 6): string {
  return Number(formatEther(wei)).toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
}

export async function getNativeBalance(network: EvmNetwork, address: string): Promise<string> {
  return formatBalance(await getNativeBalanceWei(network, address));
}
