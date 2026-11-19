import { useCallback, useEffect, useRef, useState } from "react";
import { formatEther } from "ethers";
import type { EvmNetwork } from "../config/networks";
import { getNativeBalanceWei } from "../wallet/balances";
import { getCustomTokens } from "../wallet/tokenStore";
import { inspectErc20Token, type TokenBalance } from "../wallet/tokens";
import { fetchAddressActivity, fetchAddressTokenBalances, type ExplorerActivity } from "../wallet/explorerActivity";
import { discoverKnownTokenBalances } from "../wallet/tokenDiscovery";
import { refreshRecentTransactions, type WalletTransaction } from "../wallet/history";

export type TokenSource = "known" | "indexed" | "manual";
export type WalletToken = TokenBalance & { source: TokenSource };

function friendly(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Native balance with loading/error state. Keeps the last value while refreshing. */
export function useNativeBalance(network: EvmNetwork, address: string | null, refreshKey: number) {
  const [value, setValue] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);
  const lastKey = useRef("");
  useEffect(() => {
    if (!address) { setValue(null); setError(""); return; }
    const key = `${network.chainId}:${address}`;
    if (key !== lastKey.current) { setValue(null); lastKey.current = key; }
    let active = true;
    setLoading(true);
    setError("");
    getNativeBalanceWei(network, address)
      .then((wei) => { if (active) setValue(Number(formatEther(wei))); })
      .catch((e) => { if (active) { setValue(null); setError(friendly(e, `Couldn't reach ${network.name}. Pull down to retry.`)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [network, address, refreshKey, nonce]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { value, loading, error, refresh };
}

/**
 * Token balances from three sources, merged by contract address:
 * the curated well-known list read over RPC, the public explorer index (if reachable),
 * and tokens the user added manually. All read-only.
 */
export function useTokens(network: EvmNetwork, address: string | null, refreshKey: number) {
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);
  const lastKey = useRef("");
  useEffect(() => {
    if (!address) { setTokens([]); return; }
    const key = `${network.chainId}:${address}`;
    if (key !== lastKey.current) { setTokens([]); lastKey.current = key; }
    let active = true;
    setLoading(true);
    Promise.all([
      getCustomTokens(network.chainId).then((saved) => Promise.all(saved.map(async (token): Promise<WalletToken> => {
        try {
          return { ...await inspectErc20Token(network, token.contractAddress, address), source: "manual" };
        } catch {
          return { ...token, balance: "Unavailable", source: "manual" };
        }
      }))).catch(() => [] as WalletToken[]),
      discoverKnownTokenBalances(network, address).catch(() => []),
      fetchAddressTokenBalances(network, address).catch(() => [])
    ]).then(([manual, known, indexed]) => {
      if (!active) return;
      const merged = new Map<string, WalletToken>();
      for (const token of indexed) merged.set(token.contractAddress.toLowerCase(), { ...token, source: "indexed" });
      for (const token of known) merged.set(token.contractAddress.toLowerCase(), { ...token, source: "known" });
      for (const token of manual) merged.set(token.contractAddress.toLowerCase(), token);
      const rank: Record<TokenSource, number> = { known: 0, manual: 1, indexed: 2 };
      setTokens([...merged.values()].sort((a, b) => rank[a.source] - rank[b.source] || a.symbol.localeCompare(b.symbol)));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [network, address, refreshKey, nonce]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { tokens, loading, refresh };
}

/** Explorer activity plus locally submitted transactions. Loads only while `enabled`. */
export function useActivity(network: EvmNetwork, address: string | null, enabled: boolean, refreshKey: number) {
  const [chainActivity, setChainActivity] = useState<ExplorerActivity[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [nonce, setNonce] = useState(0);
  const [loadedOnce, setLoadedOnce] = useState(false);
  useEffect(() => {
    if (!enabled || !address) return;
    let active = true;
    setLoading(true);
    setNotice("");
    Promise.all([
      refreshRecentTransactions(address).then((items) => { if (active) setTransactions(items); }).catch(() => undefined),
      fetchAddressActivity(network, address).then((items) => { if (active) setChainActivity(items); }).catch((error) => {
        if (active) { setChainActivity([]); setNotice(friendly(error, "Activity history is temporarily unavailable.")); }
      })
    ]).finally(() => { if (active) { setLoading(false); setLoadedOnce(true); } });
    return () => { active = false; };
  }, [enabled, network, address, refreshKey, nonce]);
  useEffect(() => { setLoadedOnce(false); setChainActivity([]); }, [network.chainId, address]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { chainActivity, transactions, loading, loadedOnce, notice, refresh };
}
