import type { FeeData, JsonRpcProvider } from "ethers";
import type { EvmNetwork } from "../config/networks";
import { bestProvider, withProvider } from "./rpcPool";

/**
 * Short-lived provider on the healthiest known endpoint, with a request timeout.
 * Used for signing flows, which must not silently retry on another endpoint. Callers must destroy() it.
 */
export function providerFor(network: EvmNetwork): JsonRpcProvider {
  return bestProvider(network);
}

export async function assertChain(provider: JsonRpcProvider, network: EvmNetwork): Promise<void> {
  const chainHex = await withTimeout(provider.send("eth_chainId", []), 12000, "The network did not respond.");
  if (Number(BigInt(chainHex)) !== network.chainId) {
    throw new Error(`RPC chain mismatch. Expected ${network.chainId}. Request stopped.`);
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.finally(() => { if (timer) clearTimeout(timer); }),
    new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]);
}

export type FeeQuote =
  | { kind: "eip1559"; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; cap: bigint }
  | { kind: "legacy"; gasPrice: bigint; cap: bigint };

export function selectFee(feeData: FeeData): FeeQuote {
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    return { kind: "eip1559", maxFeePerGas: feeData.maxFeePerGas, maxPriorityFeePerGas: feeData.maxPriorityFeePerGas, cap: feeData.maxFeePerGas };
  }
  if (feeData.gasPrice) return { kind: "legacy", gasPrice: feeData.gasPrice, cap: feeData.gasPrice };
  throw new Error("The network did not return usable gas fee data.");
}

/** Read-only JSON-RPC passthrough for dApps, with a timeout. */
export async function readRpc(network: EvmNetwork, method: string, params: unknown[]): Promise<unknown> {
  return withProvider(network, (provider) => provider.send(method, params), 20000);
}

export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const e = error as { shortMessage?: unknown; reason?: unknown; message?: unknown };
    if (typeof e.reason === "string" && e.reason) return e.reason;
    if (typeof e.shortMessage === "string" && e.shortMessage) return e.shortMessage;
    if (typeof e.message === "string" && e.message) return e.message.slice(0, 200);
  }
  return fallback;
}
