import { AbiCoder, formatUnits, id } from "ethers";
import type { EvmNetwork } from "../config/networks";
import { KNOWN_TOKENS } from "../config/knownTokens";
import type { IndexedTokenBalance } from "./explorerActivity";
import { withProvider } from "./rpcPool";

const BALANCE_OF = id("balanceOf(address)").slice(0, 10);

export function balanceOfCalldata(owner: string): string {
  return BALANCE_OF + AbiCoder.defaultAbiCoder().encode(["address"], [owner]).slice(2);
}

/**
 * Reads balances of the curated well-known tokens for this chain over RPC (read-only).
 * Returns only non-zero balances. Testnets and chains without a list return [].
 */
export async function discoverKnownTokenBalances(network: EvmNetwork, owner: string): Promise<IndexedTokenBalance[]> {
  const tokens = KNOWN_TOKENS[network.chainId] ?? [];
  if (tokens.length === 0) return [];
  const data = balanceOfCalldata(owner);
  const raw = await withProvider(network, (provider) =>
    Promise.all(tokens.map((token) => provider.call({ to: token.contractAddress, data }).catch(() => "0x")))
  , 12000);
  const found: IndexedTokenBalance[] = [];
  raw.forEach((value, index) => {
    if (!value || value === "0x") return;
    let amount: bigint;
    try { amount = BigInt(value.slice(0, 66)); } catch { return; }
    if (amount <= 0n) return;
    const token = tokens[index];
    found.push({ chainId: network.chainId, ...token, balance: formatUnits(amount, token.decimals) });
  });
  return found;
}
