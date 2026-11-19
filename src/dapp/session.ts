import { addConnection, listConnections, removeConnection, type Connection } from "../wallet/localStore";
import { readRpc } from "../wallet/rpc";
import { approvalQueue, type PeerInfo } from "./approvalCenter";
import { ProviderRpcError, ErrorCodes } from "./errors";
import type { RequestContext } from "./router";
import { getWalletState, hasWalletState } from "./walletState";

/** In-memory mirror of the connections table so eth_accounts can answer synchronously. */
const connected = new Set<string>();
const listeners = new Set<() => void>();
let loaded: Promise<void> | null = null;

const key = (origin: string, address: string) => `${origin}|${address.toLowerCase()}`;

export function loadConnections(): Promise<void> {
  if (!loaded) {
    loaded = listConnections()
      .then((rows) => { rows.forEach((row) => connected.add(key(row.origin, row.address))); listeners.forEach((l) => l()); })
      .catch(() => { loaded = null; });
  }
  return loaded;
}

export function isOriginConnected(origin: string, address: string | null): boolean {
  return !!address && connected.has(key(origin, address));
}

export function subscribeConnections(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export async function connectOrigin(origin: string, address: string, source: string, name?: string): Promise<void> {
  connected.add(key(origin, address));
  listeners.forEach((l) => l());
  try { await addConnection(origin, address, source, name); } catch { /* the in-memory grant still applies for this run */ }
}

export async function disconnectOrigin(origin: string, address?: string): Promise<void> {
  for (const entry of [...connected]) {
    if (entry.startsWith(`${origin}|`) && (!address || entry === key(origin, address))) connected.delete(entry);
  }
  listeners.forEach((l) => l());
  approvalQueue.cancelOrigin(origin, new ProviderRpcError(ErrorCodes.disconnected, "The site was disconnected from TREX Wallet."));
  try { await removeConnection(origin, address); } catch { /* best effort */ }
}

export async function connectionList(address?: string): Promise<Connection[]> {
  return listConnections(address);
}

/** Request context used by both the in-app browser and WalletConnect sessions. */
export function createRequestContext(peer: PeerInfo, hooks?: { onDisconnect?: () => Promise<void> | void }): RequestContext {
  const state = () => {
    if (!hasWalletState()) throw new ProviderRpcError(ErrorCodes.disconnected, "TREX Wallet is not ready.");
    const current = getWalletState();
    if (!current.unlocked) throw new ProviderRpcError(ErrorCodes.unauthorized, "Unlock TREX Wallet first.");
    return current;
  };
  return {
    origin: peer.origin,
    source: peer.source,
    getActiveAddress: () => state().address,
    getChainId: () => (hasWalletState() ? getWalletState().network.chainId : 84532),
    isConnected: () => isOriginConnected(peer.origin, hasWalletState() ? getWalletState().address : null),
    requestConnection: async () => {
      const current = state();
      const approved = await approvalQueue.ask({ type: "connect", peer, chainId: current.network.chainId });
      if (approved && current.address) await connectOrigin(peer.origin, current.address, peer.source, peer.name);
      return approved;
    },
    requestChainSwitch: (chainId) => approvalQueue.ask({ type: "switchChain", peer, chainId }),
    requestSignature: (request) => approvalQueue.ask({ type: "sign", peer, request, chainId: state().network.chainId }),
    disconnect: async () => {
      await disconnectOrigin(peer.origin, hasWalletState() ? getWalletState().address ?? undefined : undefined);
      await hooks?.onDisconnect?.();
    },
    readRpc: (method, params) => readRpc(state().network, method, params)
  };
}
