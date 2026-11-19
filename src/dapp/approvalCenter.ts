import { ProviderRpcError, ErrorCodes, userRejected } from "./errors";
import type { DappSource, SignRequest } from "./router";

export type PeerInfo = {
  origin: string;
  source: DappSource;
  name?: string;
  icon?: string;
  /** WalletConnect bookkeeping so expiry and disconnects can close the right sheet. */
  wcTopic?: string;
  wcRequestId?: number;
  wcProposalId?: number;
};

export type CancelNotice = { peer: PeerInfo; type: PendingRequest["type"]; message: string };

export type PendingRequest =
  | { id: number; type: "connect"; peer: PeerInfo; chainId: number; resolve: (approved: boolean) => void; reject: (error: Error) => void }
  | { id: number; type: "switchChain"; peer: PeerInfo; chainId: number; resolve: (approved: boolean) => void; reject: (error: Error) => void }
  | { id: number; type: "sign"; peer: PeerInfo; request: SignRequest; chainId: number; resolve: (result: string) => void; reject: (error: Error) => void };

type NewRequest =
  | { type: "connect"; peer: PeerInfo; chainId: number }
  | { type: "switchChain"; peer: PeerInfo; chainId: number }
  | { type: "sign"; peer: PeerInfo; request: SignRequest; chainId: number };

export const MAX_PENDING_PER_ORIGIN = 4;

/**
 * FIFO queue of requests waiting for the user. Only the head is shown; a site
 * cannot flood the wallet (per-origin cap) and every request settles exactly once.
 */
export class ApprovalQueue {
  private items: PendingRequest[] = [];
  private listeners = new Set<(head: PendingRequest | null, size: number) => void>();
  private nextId = 1;
  private cancelListeners = new Set<(notice: CancelNotice) => void>();

  /** Notified when a request is withdrawn by something other than the user (expiry, disconnect). */
  onCancelled(listener: (notice: CancelNotice) => void): () => void {
    this.cancelListeners.add(listener);
    return () => { this.cancelListeners.delete(listener); };
  }

  isPending(id: number): boolean {
    return this.items.some((item) => item.id === id);
  }

  /** Throws when the request was withdrawn meanwhile, so nothing is signed for a dead request. */
  assertPending(id: number): void {
    if (!this.isPending(id)) throw new ProviderRpcError(ErrorCodes.resourceUnavailable, "This request expired or was withdrawn by the app. Nothing was signed.");
  }

  subscribe(listener: (head: PendingRequest | null, size: number) => void): () => void {
    this.listeners.add(listener);
    listener(this.head(), this.items.length);
    return () => { this.listeners.delete(listener); };
  }

  head(): PendingRequest | null {
    return this.items[0] ?? null;
  }

  size(): number {
    return this.items.length;
  }

  private notify() {
    const head = this.head();
    this.listeners.forEach((listener) => listener(head, this.items.length));
  }

  ask(request: { type: "connect" | "switchChain"; peer: PeerInfo; chainId: number }): Promise<boolean>;
  ask(request: { type: "sign"; peer: PeerInfo; request: SignRequest; chainId: number }): Promise<string>;
  ask(request: NewRequest): Promise<boolean | string> {
    const pendingForOrigin = this.items.filter((item) => item.peer.origin === request.peer.origin).length;
    if (pendingForOrigin >= MAX_PENDING_PER_ORIGIN) {
      return Promise.reject(new ProviderRpcError(ErrorCodes.resourceUnavailable, "Too many pending requests from this site. Finish or reject the open ones first."));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const once = <T,>(fn: (value: T) => void) => (value: T) => {
        if (settled) return;
        settled = true;
        this.items = this.items.filter((item) => item.id !== id);
        this.notify();
        fn(value);
      };
      const id = this.nextId++;
      const item = { ...request, id, resolve: once(resolve as (v: unknown) => void), reject: once(reject) } as PendingRequest;
      this.items.push(item);
      this.notify();
    });
  }

  /**
   * Rejects matching requests and tells listeners why (e.g. a WalletConnect request
   * expired or its session ended). Returns how many were cancelled.
   */
  cancelWhere(match: (item: PendingRequest) => boolean, error: Error, notify = true): number {
    const matches = this.items.filter(match);
    matches.forEach((item) => {
      item.reject(error);
      if (notify) this.cancelListeners.forEach((listener) => { try { listener({ peer: item.peer, type: item.type, message: error.message }); } catch { /* ignore */ } });
    });
    return matches.length;
  }

  /** Rejects every pending request from one origin (navigation, disconnect, session expiry). */
  cancelOrigin(origin: string, error: Error = userRejected("The request was cancelled.")) {
    this.items.filter((item) => item.peer.origin === origin).forEach((item) => item.reject(error));
  }

  /** Rejects everything (e.g. when the app is backgrounded and locks). */
  cancelAll(error: Error = userRejected("TREX Wallet locked before the request was approved.")) {
    [...this.items].forEach((item) => item.reject(error));
  }
}

export const approvalQueue = new ApprovalQueue();
