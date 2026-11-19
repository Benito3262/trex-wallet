import type { EvmNetwork } from "../config/networks";
import type { DappTransaction } from "../dapp/router";
import { assertChain, errorMessage, providerFor, selectFee, withTimeout } from "../wallet/rpc";
import type { SimulationResult } from "./review";

export type PreparedTransaction = {
  to: string | null;
  data: string;
  value: bigint;
  gasLimit: bigint | null;
  fee: ReturnType<typeof selectFee> | null;
};

const toBig = (hex?: string) => (hex ? BigInt(hex) : 0n);

/**
 * Dry-runs a transaction with eth_call and estimateGas, then checks that the
 * balance covers value + maximum fee and whether the destination has code.
 * Every step is best-effort: RPC failures produce "unavailable", never a crash.
 */
export async function simulateTransaction(network: EvmNetwork, tx: DappTransaction): Promise<{ simulation: SimulationResult; prepared: PreparedTransaction }> {
  const value = toBig(tx.value);
  const data = tx.data ?? "0x";
  const prepared: PreparedTransaction = { to: tx.to ?? null, data, value, gasLimit: tx.gas ? BigInt(tx.gas) : null, fee: null };
  const result: SimulationResult = { status: "unavailable", value, insufficientFunds: false, toIsContract: null };
  const provider = providerFor(network);
  try {
    await assertChain(provider, network);
    const call = { from: tx.from, to: tx.to ?? undefined, data, value };
    const [balance, feeData, code] = await Promise.all([
      withTimeout(provider.getBalance(tx.from), 15000, "Balance check timed out."),
      withTimeout(provider.getFeeData(), 15000, "Fee check timed out.").catch(() => null),
      tx.to ? withTimeout(provider.getCode(tx.to), 15000, "Code check timed out.").catch(() => null) : Promise.resolve(null)
    ]);
    result.balance = balance;
    result.toIsContract = code === null ? null : code !== "0x";
    try {
      await withTimeout(provider.call(call), 20000, "Simulation timed out.");
      result.status = "success";
    } catch (error) {
      const message = errorMessage(error, "");
      const code = (error as { code?: unknown })?.code;
      if (code === "CALL_EXCEPTION" || /revert/i.test(message)) {
        result.status = "reverted";
        result.revertReason = message.replace(/^execution reverted:?\s*/i, "") || undefined;
      } else {
        result.status = "unavailable";
        result.error = message || "RPC error";
      }
    }
    if (!prepared.gasLimit) {
      try {
        const estimate = await withTimeout(provider.estimateGas(call), 20000, "Gas estimate timed out.");
        prepared.gasLimit = (estimate * 120n) / 100n; // 20% headroom
      } catch {
        prepared.gasLimit = null;
      }
    }
    if (feeData) {
      try {
        const fee = tx.maxFeePerGas && tx.maxPriorityFeePerGas
          ? { kind: "eip1559" as const, maxFeePerGas: BigInt(tx.maxFeePerGas), maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas), cap: BigInt(tx.maxFeePerGas) }
          : tx.gasPrice
            ? { kind: "legacy" as const, gasPrice: BigInt(tx.gasPrice), cap: BigInt(tx.gasPrice) }
            : selectFee(feeData);
        prepared.fee = fee;
      } catch {
        prepared.fee = null;
      }
    }
    if (prepared.gasLimit && prepared.fee) {
      result.gasLimit = prepared.gasLimit;
      result.maxFee = prepared.gasLimit * prepared.fee.cap;
      result.insufficientFunds = balance < value + result.maxFee;
    } else {
      result.insufficientFunds = balance < value;
    }
  } catch (error) {
    result.status = "unavailable";
    result.error = errorMessage(error, "The network could not be reached.");
  } finally {
    provider.destroy();
  }
  return { simulation: result, prepared };
}
