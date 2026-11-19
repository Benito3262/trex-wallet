import { Core } from "@walletconnect/core";
import { WalletKit, type IWalletKit, type WalletKitTypes } from "@reown/walletkit";
import { buildApprovedNamespaces, getSdkError } from "@walletconnect/utils";
import type { SessionTypes } from "@walletconnect/types";
import { approvalQueue, type PeerInfo } from "../dapp/approvalCenter";
import { ProviderRpcError, ErrorCodes, toRpcError } from "../dapp/errors";
import { routeRequest, toHexChainId } from "../dapp/router";
import { connectOrigin, createRequestContext, disconnectOrigin } from "../dapp/session";
import { getWalletState, hasWalletState, subscribeWalletState } from "../dapp/walletState";
import { parseCaipChain, supportedNamespaces, validatePairingUri } from "./namespaces";

/** Public Reown project ID, injected at build time. Missing ID disables WalletConnect without crashing. */
export const WALLETCONNECT_PROJECT_ID = process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() || "";

export const WALLET_METADATA = {
  name: "TREX Wallet",
  description: "Your Web3 wallet",
  url: "https://github.com/Benito3262/trex-wallet",
  icons: ["https://raw.githubusercontent.com/Benito3262/trex-wallet/main/assets/logo.png"],
  redirect: { native: "trexwallet://" }
};

export type WcStatus = "missing-project-id" | "idle" | "initializing" | "ready" | "error";
export type WcSession = { topic: string; name: string; url: string; icon?: string; expiry: number };
export type WcState = { status: WcStatus; error: string | null; sessions: WcSession[]; pairing: boolean };

let kit: IWalletKit | null = null;
let initPromise: Promise<IWalletKit> | null = null;
let state: WcState = { status: WALLETCONNECT_PROJECT_ID ? "idle" : "missing-project-id", error: null, sessions: [], pairing: false };
const listeners = new Set<(state: WcState) => void>();
let pairingTimer: ReturnType<typeof setTimeout> | null = null;

function setState(patch: Partial<WcState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => { try { listener(state); } catch { /* ignore */ } });
}

export function getWcState(): WcState {
  return state;
}

export function subscribeWc(listener: (state: WcState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => { listeners.delete(listener); };
}

function peerFromSession(session: SessionTypes.Struct): PeerInfo {
  const meta = session.peer.metadata;
  return { origin: originFromUrl(meta.url), source: "walletconnect", name: meta.name, icon: meta.icons?.[0] };
}

function originFromUrl(url: string | undefined): string {
  try { return new URL(url ?? "").origin; } catch { return url ? `wc:${url}` : "wc:unknown"; }
}

function refreshSessions() {
  if (!kit) return;
  try {
    const sessions = Object.values(kit.getActiveSessions()).map((session) => ({
      topic: session.topic,
      name: session.peer.metadata.name || "Unknown app",
      url: session.peer.metadata.url,
      icon: session.peer.metadata.icons?.[0],
      expiry: session.expiry
    }));
    setState({ sessions });
  } catch { /* keep the previous list */ }
}

/** Initializes WalletKit once. Safe to call repeatedly; failures are reported in state, not thrown to the UI. */
export function initWalletConnect(): Promise<IWalletKit> {
  if (!WALLETCONNECT_PROJECT_ID) {
    setState({ status: "missing-project-id" });
    return Promise.reject(new Error("WalletConnect needs a project ID (EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID)."));
  }
  if (kit) return Promise.resolve(kit);
  if (!initPromise) {
    setState({ status: "initializing", error: null });
    initPromise = (async () => {
      const core = new Core({ projectId: WALLETCONNECT_PROJECT_ID });
      const instance = await WalletKit.init({ core, metadata: WALLET_METADATA });
      kit = instance;
      attachListeners(instance);
      refreshSessions();
      setState({ status: "ready", error: null });
      return instance;
    })().catch((error) => {
      initPromise = null;
      kit = null;
      setState({ status: "error", error: error instanceof Error ? error.message : "WalletConnect could not start." });
      throw error;
    });
  }
  return initPromise;
}

function attachListeners(instance: IWalletKit) {
  instance.on("session_proposal", (proposal) => { void handleProposal(instance, proposal); });
  instance.on("session_request", (event) => { void handleRequest(instance, event); });
  instance.on("session_delete", (event) => {
    const origin = sessionOrigins.get(event.topic);
    sessionOrigins.delete(event.topic);
    if (origin) void disconnectOrigin(origin);
    refreshSessions();
  });
  instance.on("proposal_expire", () => {
    setState({ pairing: false, error: "The connection request expired before it was approved. Ask the site for a new QR code." });
  });
  instance.on("session_request_expire", () => {
    // The dApp gave up waiting; the head sheet for that site is no longer useful.
    refreshSessions();
  });
  instance.on("session_authenticate", (event) => {
    // One-click auth is not supported yet; rejecting makes dApps fall back to a normal session proposal.
    instance.rejectSessionAuthenticate({ id: event.id, reason: getSdkError("USER_REJECTED") }).catch(() => undefined);
  });
  subscribeWalletState((next, previous) => {
    if (next.address && next.address !== previous.address) void updateAccounts(instance, next.address);
    if (next.network.chainId !== previous.network.chainId) void emitChain(instance, next.network.chainId);
  });
}

const sessionOrigins = new Map<string, string>();

async function handleProposal(instance: IWalletKit, proposal: WalletKitTypes.SessionProposal) {
  if (pairingTimer) { clearTimeout(pairingTimer); pairingTimer = null; }
  setState({ pairing: false });
  const meta = proposal.params.proposer.metadata;
  const peer: PeerInfo = { origin: originFromUrl(meta.url), source: "walletconnect", name: meta.name, icon: meta.icons?.[0] };
  try {
    if (!hasWalletState() || !getWalletState().unlocked || !getWalletState().address) throw new Error("Unlock TREX Wallet before connecting.");
    // Validate up front so unsupported chains/methods are rejected before showing a prompt.
    buildApprovedNamespaces({ proposal: proposal.params, supportedNamespaces: supportedNamespaces(getWalletState().address as string) });
    const approved = await approvalQueue.ask({ type: "connect", peer, chainId: getWalletState().network.chainId });
    if (!approved) {
      await instance.rejectSession({ id: proposal.id, reason: getSdkError("USER_REJECTED") });
      return;
    }
    const address = getWalletState().address;
    if (!address) throw new Error("No active account.");
    const session = await instance.approveSession({ id: proposal.id, namespaces: buildApprovedNamespaces({ proposal: proposal.params, supportedNamespaces: supportedNamespaces(address) }) });
    sessionOrigins.set(session.topic, peer.origin);
    await connectOrigin(peer.origin, address, "walletconnect", peer.name);
    refreshSessions();
  } catch (error) {
    const message = error instanceof Error ? error.message : "The connection failed.";
    const unsupported = /chain|namespace|method/i.test(message);
    setState({ error: unsupported ? `This app asked for networks or methods TREX does not support: ${message}` : message });
    instance.rejectSession({ id: proposal.id, reason: getSdkError(unsupported ? "UNSUPPORTED_CHAINS" : "USER_REJECTED") }).catch(() => undefined);
  }
}

async function handleRequest(instance: IWalletKit, event: WalletKitTypes.SessionRequest) {
  const { topic, id, params } = event;
  const respondError = (error: unknown) =>
    instance.respondSessionRequest({ topic, response: { id, jsonrpc: "2.0", error: { code: toRpcError(error).code, message: toRpcError(error).message } } }).catch(() => undefined);
  try {
    const session = instance.getActiveSessions()[topic];
    if (!session) throw new ProviderRpcError(ErrorCodes.unauthorized, "Unknown or expired WalletConnect session.");
    const peer = peerFromSession(session);
    sessionOrigins.set(topic, peer.origin);
    const { method } = params.request;
    let requestParams = params.request.params as unknown;
    const requestedChain = parseCaipChain(params.chainId);
    // Carry the chain the dApp targeted into the transaction so the review sheet can block a mismatch.
    if (method === "eth_sendTransaction" && requestedChain && Array.isArray(requestParams) && requestParams[0] && typeof requestParams[0] === "object") {
      requestParams = [{ ...(requestParams[0] as object), chainId: toHexChainId(requestedChain) }, ...requestParams.slice(1)];
    }
    // WalletConnect dApps often send v4 payloads under the legacy eth_signTypedData name.
    const routedMethod = method === "eth_signTypedData" ? "eth_signTypedData_v4" : method;
    const result = await routeRequest(createRequestContext(peer, { onDisconnect: () => disconnectSession(topic) }), routedMethod, requestParams);
    await instance.respondSessionRequest({ topic, response: { id, jsonrpc: "2.0", result: result ?? null } });
  } catch (error) {
    await respondError(error);
  }
}

async function updateAccounts(instance: IWalletKit, address: string) {
  for (const session of Object.values(instance.getActiveSessions())) {
    try {
      const namespaces = { ...session.namespaces };
      const eip155 = namespaces.eip155;
      if (!eip155) continue;
      const chains = eip155.chains ?? Array.from(new Set(eip155.accounts.map((account) => account.split(":").slice(0, 2).join(":"))));
      namespaces.eip155 = { ...eip155, accounts: chains.map((chain) => `${chain}:${address}`) };
      await instance.updateSession({ topic: session.topic, namespaces });
      await connectOrigin(peerFromSession(session).origin, address, "walletconnect", session.peer.metadata.name);
      const chainId = hasWalletState() ? getWalletState().network.chainId : 84532;
      await instance.emitSessionEvent({ topic: session.topic, event: { name: "accountsChanged", data: [address] }, chainId: `eip155:${chainId}` });
    } catch { /* the session may have expired; it will disappear on refresh */ }
  }
  refreshSessions();
}

async function emitChain(instance: IWalletKit, chainId: number) {
  for (const session of Object.values(instance.getActiveSessions())) {
    try {
      await instance.emitSessionEvent({ topic: session.topic, event: { name: "chainChanged", data: chainId }, chainId: `eip155:${chainId}` });
    } catch { /* ignore */ }
  }
}

/** Starts pairing from a pasted wc: URI. Resolves when the pairing is sent; the proposal arrives as an event. */
export async function pair(input: string): Promise<void> {
  let uri: string;
  try {
    uri = validatePairingUri(input);
  } catch (error) {
    setState({ error: error instanceof Error ? error.message : "Invalid WalletConnect link." });
    throw error;
  }
  const instance = await initWalletConnect();
  setState({ pairing: true, error: null });
  if (pairingTimer) clearTimeout(pairingTimer);
  pairingTimer = setTimeout(() => {
    if (state.pairing) setState({ pairing: false, error: "No response from the site. The link may have been used already or expired. Refresh the QR on the site and try again." });
  }, 30000);
  try {
    await instance.pair({ uri });
  } catch (error) {
    if (pairingTimer) { clearTimeout(pairingTimer); pairingTimer = null; }
    const message = error instanceof Error ? error.message : "Pairing failed.";
    setState({ pairing: false, error: /already exists|expired/i.test(message) ? "This link was already used or has expired. Refresh the QR on the site and copy a new link." : message });
    throw error;
  }
}

export async function disconnectSession(topic: string): Promise<void> {
  const origin = sessionOrigins.get(topic);
  if (kit) {
    try { await kit.disconnectSession({ topic, reason: getSdkError("USER_DISCONNECTED") }); } catch { /* already gone */ }
  }
  sessionOrigins.delete(topic);
  if (origin) await disconnectOrigin(origin);
  refreshSessions();
}

/** Disconnects every WalletConnect session for a site origin (used by Connected sites). */
export async function disconnectOriginSessions(origin: string): Promise<void> {
  if (!kit) return;
  for (const session of Object.values(kit.getActiveSessions())) {
    if (peerFromSession(session).origin === origin) await disconnectSession(session.topic);
  }
}
