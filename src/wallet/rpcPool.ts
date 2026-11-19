import { FetchRequest, JsonRpcProvider } from "ethers";
import { rpcUrlsFor, type EvmNetwork } from "../config/networks";

/**
 * Read calls go through several free public RPCs per chain: the last endpoint that
 * worked is tried first, failing endpoints cool down, and every call has a timeout.
 * Contract reverts and invalid input are real answers, so they are never retried.
 */

export const RPC_TIMEOUT_MS = 8000;
const COOLDOWN_MS = 60_000;

export type ProviderFactory = (url: string, chainId: number) => JsonRpcProvider;

export const defaultProviderFactory: ProviderFactory = (url, chainId) => {
  const request = new FetchRequest(url);
  request.timeout = RPC_TIMEOUT_MS;
  // staticNetwork: never poll eth_chainId in the background; batchMaxCount 1: some free RPCs reject batches.
  return new JsonRpcProvider(request, chainId, { staticNetwork: true, batchMaxCount: 1 });
};

let factory: ProviderFactory = defaultProviderFactory;
const preferred = new Map<number, string>();
const cooldownUntil = new Map<string, number>();
const verified = new Set<string>();
const wrongChain = new Set<string>();

/** Test hook. */
export function setProviderFactory(next: ProviderFactory | null) {
  factory = next ?? defaultProviderFactory;
}

/** Test hook. */
export function resetRpcPool() {
  preferred.clear();
  cooldownUntil.clear();
  verified.clear();
  wrongChain.clear();
}

/** Endpoints in the order to try: last good one first, cooled-down ones last. */
export function orderedEndpoints(chainId: number, now = Date.now()): string[] {
  const urls = rpcUrlsFor(chainId).filter((url) => !wrongChain.has(`${chainId}|${url}`));
  const best = preferred.get(chainId);
  const sorted = best && urls.includes(best) ? [best, ...urls.filter((url) => url !== best)] : urls;
  const healthy = sorted.filter((url) => (cooldownUntil.get(url) ?? 0) <= now);
  const cooling = sorted.filter((url) => (cooldownUntil.get(url) ?? 0) > now);
  return [...healthy, ...cooling];
}

const ANSWER_CODES = new Set(["CALL_EXCEPTION", "INVALID_ARGUMENT", "ACTION_REJECTED", "INSUFFICIENT_FUNDS", "NONCE_EXPIRED", "REPLACEMENT_UNDERPRICED", "TRANSACTION_REPLACED", "NUMERIC_FAULT"]);

/** True when the error says something about the endpoint (down, slow, rate-limited), not about the request. */
export function isEndpointFailure(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === "string" && ANSWER_CODES.has(code)) return false;
  // JSON-RPC "invalid request/params" and "execution reverted" are answers about the request itself.
  const rpcCode = (error as { error?: { code?: unknown } } | null)?.error?.code;
  return !(rpcCode === -32600 || rpcCode === -32602 || rpcCode === 3);
}

/** An error that is the chain's real answer (bad input, not a token...), so other endpoints are not tried. */
export function answerError(message: string): Error {
  return Object.assign(new Error(message), { code: "INVALID_ARGUMENT" });
}

export class ChainMismatchError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => { if (timer) clearTimeout(timer); }),
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error("The network did not respond in time."), { code: "TIMEOUT" })), ms); })
  ]);
}

export class NetworkUnavailableError extends Error {
  constructor(public network: string, public attempts: { url: string; message: string }[]) {
    super(`Couldn't reach ${network} right now. Check your connection and pull down to try again.`);
    this.name = "NetworkUnavailableError";
  }
}

/** Runs a read against the chain, falling back across endpoints. */
export async function withProvider<T>(network: EvmNetwork, task: (provider: JsonRpcProvider) => Promise<T>, timeoutMs = RPC_TIMEOUT_MS): Promise<T> {
  const attempts: { url: string; message: string }[] = [];
  for (const url of orderedEndpoints(network.chainId)) {
    const provider = factory(url, network.chainId);
    try {
      const key = `${network.chainId}|${url}`;
      if (!verified.has(key)) {
        const chainHex = await withTimeout(provider.send("eth_chainId", []) as Promise<string>, timeoutMs);
        if (Number(BigInt(chainHex)) !== network.chainId) {
          wrongChain.add(key);
          throw new ChainMismatchError(`Endpoint reported chain ${Number(BigInt(chainHex))}.`);
        }
        verified.add(key);
      }
      const result = await withTimeout(task(provider), timeoutMs);
      preferred.set(network.chainId, url);
      cooldownUntil.delete(url);
      return result;
    } catch (error) {
      if (!isEndpointFailure(error)) throw error;
      cooldownUntil.set(url, Date.now() + COOLDOWN_MS);
      attempts.push({ url, message: error instanceof Error ? error.message.slice(0, 120) : String(error) });
    } finally {
      provider.destroy();
    }
  }
  throw new NetworkUnavailableError(network.name, attempts);
}

/** Provider for the best known endpoint (used for broadcasts, which must not be retried blindly). */
export function bestProvider(network: EvmNetwork): JsonRpcProvider {
  return factory(orderedEndpoints(network.chainId)[0], network.chainId);
}
