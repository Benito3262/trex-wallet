import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AppState, Linking } from "react-native";
import { DEFAULT_NETWORK, NETWORKS, type EvmNetwork } from "../config/networks";
import { loadRegistry, subscribeRegistry } from "../wallet/vault";
import { activeAccount, type AccountMeta, type AccountRegistry } from "../wallet/accounts";
import { approvalQueue } from "../dapp/approvalCenter";
import { registerChainSwitcher, setWalletState } from "../dapp/walletState";
import { hasUsedWalletConnect, initWalletConnect } from "../walletconnect/service";
import { pairingUriFromDeepLink } from "../walletconnect/namespaces";
import { appLock } from "../wallet/appLock";

export type SheetKind = "network" | "account" | "mainnet" | null;

type WalletContextValue = {
  network: EvmNetwork;
  selectChain: (chainId: number) => void;
  walletAddress: string | null;
  setWalletAddress: (address: string | null) => void;
  walletUnlocked: boolean;
  setWalletUnlocked: (unlocked: boolean) => void;
  registry: AccountRegistry | null;
  currentAccount: AccountMeta | undefined;
  booting: boolean;
  tokenRefreshKey: number;
  bumpTokens: () => void;
  activityRefreshKey: number;
  bumpActivity: () => void;
  balanceHidden: boolean;
  toggleBalanceHidden: () => void;
  sheet: SheetKind;
  openSheet: (sheet: SheetKind) => void;
  restoreFromLock: boolean;
  setRestoreFromLock: (value: boolean) => void;
  pendingWcUri: string | null;
  takePendingWcUri: () => string | null;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet(): WalletContextValue {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used inside WalletProvider.");
  return value;
}

/** App-wide wallet state and side effects (lock, deep links, dApp state sync, lazy WalletConnect). */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [chainId, setChainId] = useState(DEFAULT_NETWORK.chainId);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletUnlocked, setWalletUnlocked] = useState(false);
  const [registry, setRegistry] = useState<AccountRegistry | null>(null);
  const [booting, setBooting] = useState(true);
  const [tokenRefreshKey, setTokenRefreshKey] = useState(0);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [restoreFromLock, setRestoreFromLock] = useState(false);
  const [pendingWcUri, setPendingWcUri] = useState<string | null>(null);
  const network = useMemo(() => NETWORKS.find((item) => item.chainId === chainId) ?? DEFAULT_NETWORK, [chainId]);
  const currentAccount = registry ? activeAccount(registry) : undefined;

  const selectChain = useCallback((id: number) => {
    if (!NETWORKS.some((item) => item.chainId === id)) throw new Error("Unsupported network.");
    setChainId(id);
  }, []);

  useEffect(() => {
    setWalletState({ accountId: currentAccount?.id ?? null, address: walletAddress, network, unlocked: walletUnlocked && !!walletAddress });
  }, [currentAccount?.id, walletAddress, network, walletUnlocked]);

  // WalletConnect starts lazily, only if this device paired before; deferred and fully caught.
  useEffect(() => {
    if (!walletUnlocked || !walletAddress) return;
    const timer = setTimeout(() => {
      hasUsedWalletConnect().then((used) => (used ? initWalletConnect() : undefined)).catch(() => undefined);
    }, 1500);
    return () => clearTimeout(timer);
  }, [walletUnlocked, walletAddress]);

  // trexwallet://wc?uri=wc:... deep links open the WalletConnect screen (see navigation).
  useEffect(() => {
    const open = (url: string | null | undefined) => {
      const uri = url ? pairingUriFromDeepLink(url) : null;
      if (uri) setPendingWcUri(uri);
    };
    Linking.getInitialURL().then(open).catch(() => undefined);
    const subscription = Linking.addEventListener("url", ({ url }) => open(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => registerChainSwitcher((id) => selectChain(id)), [selectChain]);

  useEffect(() => {
    const lock = () => {
      setWalletUnlocked(false);
      setSheet(null);
      approvalQueue.cancelAll();
    };
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (appLock.onActive()) lock();
      } else if (appLock.onBackground()) {
        lock();
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let mounted = true;
    loadRegistry().then((loaded) => {
      if (!mounted || !loaded) return;
      setRegistry(loaded);
      const address = activeAccount(loaded)?.address;
      if (address) setWalletAddress(address);
    }).catch(() => undefined).finally(() => { if (mounted) setBooting(false); });
    const unsubscribe = subscribeRegistry((next) => { if (mounted) setRegistry(next); });
    return () => { mounted = false; unsubscribe(); };
  }, []);

  const value = useMemo<WalletContextValue>(() => ({
    network,
    selectChain,
    walletAddress,
    setWalletAddress,
    walletUnlocked,
    setWalletUnlocked,
    registry,
    currentAccount,
    booting,
    tokenRefreshKey,
    bumpTokens: () => setTokenRefreshKey((v) => v + 1),
    activityRefreshKey,
    bumpActivity: () => setActivityRefreshKey((v) => v + 1),
    balanceHidden,
    toggleBalanceHidden: () => setBalanceHidden((v) => !v),
    sheet,
    openSheet: setSheet,
    restoreFromLock,
    setRestoreFromLock,
    pendingWcUri,
    takePendingWcUri: () => { const uri = pendingWcUri; setPendingWcUri(null); return uri; }
  }), [network, selectChain, walletAddress, walletUnlocked, registry, currentAccount, booting, tokenRefreshKey, activityRefreshKey, balanceHidden, sheet, restoreFromLock, pendingWcUri]);

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
