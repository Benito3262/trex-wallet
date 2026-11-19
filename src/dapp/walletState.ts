import type { EvmNetwork } from "../config/networks";

/** Snapshot of the wallet that dApp sessions read; App.tsx keeps it current. */
export type WalletState = {
  accountId: string | null;
  address: string | null;
  network: EvmNetwork;
  unlocked: boolean;
};

type Listener = (state: WalletState, previous: WalletState) => void;

let state: WalletState | null = null;
const listeners = new Set<Listener>();
let switchChainHandler: ((chainId: number) => void) | null = null;

export function getWalletState(): WalletState {
  if (!state) throw new Error("Wallet state is not ready.");
  return state;
}

export function hasWalletState(): boolean {
  return state !== null;
}

export function setWalletState(next: WalletState) {
  const previous = state ?? next;
  state = next;
  if (previous.address !== next.address || previous.network.chainId !== next.network.chainId || previous.unlocked !== next.unlocked || previous.accountId !== next.accountId) {
    listeners.forEach((listener) => {
      try { listener(next, previous); } catch { /* a listener must not break others */ }
    });
  }
}

export function subscribeWalletState(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function registerChainSwitcher(handler: (chainId: number) => void): () => void {
  switchChainHandler = handler;
  return () => { if (switchChainHandler === handler) switchChainHandler = null; };
}

export function switchChain(chainId: number) {
  if (!switchChainHandler) throw new Error("Network switching is not available right now.");
  switchChainHandler(chainId);
}
