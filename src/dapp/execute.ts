import { formatEther, getBytes, isHexString, toUtf8Bytes } from "ethers";
import { assertSigningAllowed, type EvmNetwork } from "../config/networks";
import { decodeApprovalCall } from "../security/approvalRewrite";
import type { PreparedTransaction } from "../security/simulate";
import { summarizeTypedData, typesForSigning } from "../security/typedData";
import { recordTransaction } from "../wallet/history";
import { recordInteraction, trackApproval, forgetApproval } from "../wallet/localStore";
import { assertChain, providerFor, selectFee, withTimeout } from "../wallet/rpc";
import { unlockAccount } from "../wallet/vault";

/**
 * The only place dApp requests are signed. Each call unlocks the account with
 * biometrics, re-checks the network rules, signs, and drops the key.
 */

export async function signPersonalMessage(accountId: string, expectedAddress: string, chainId: number, message: string): Promise<string> {
  assertSigningAllowed(chainId);
  const { signer } = await unlockAccount(accountId, "Authenticate to sign this message");
  if (signer.address.toLowerCase() !== expectedAddress.toLowerCase()) throw new Error("The active account changed. Request cancelled.");
  const bytes = isHexString(message) ? getBytes(message) : toUtf8Bytes(message);
  return signer.signMessage(bytes);
}

export async function signTypedDataV4(accountId: string, expectedAddress: string, chainId: number, typedData: unknown): Promise<string> {
  assertSigningAllowed(chainId);
  const summary = summarizeTypedData(typedData);
  if (summary.chainId !== null) {
    assertSigningAllowed(summary.chainId);
    if (summary.chainId !== chainId) throw new Error("Chain mismatch. Signature cancelled.");
  }
  const { signer } = await unlockAccount(accountId, "Authenticate to sign this request");
  if (signer.address.toLowerCase() !== expectedAddress.toLowerCase()) throw new Error("The active account changed. Request cancelled.");
  const { domain, message } = summary.payload;
  return signer.signTypedData(domain as Record<string, never>, typesForSigning(summary.payload), message);
}

export async function sendPreparedTransaction(opts: {
  accountId: string;
  expectedAddress: string;
  network: EvmNetwork;
  prepared: PreparedTransaction;
  origin: string;
}): Promise<string> {
  const { network, prepared } = opts;
  assertSigningAllowed(network.chainId);
  const provider = providerFor(network);
  try {
    await assertChain(provider, network);
    const { signer: baseSigner } = await unlockAccount(opts.accountId, "Authenticate to send this transaction");
    if (baseSigner.address.toLowerCase() !== opts.expectedAddress.toLowerCase()) throw new Error("The active account changed. Transaction cancelled.");
    const signer = baseSigner.connect(provider);
    const request = { from: signer.address, to: prepared.to ?? undefined, data: prepared.data, value: prepared.value };
    const gasLimit = prepared.gasLimit ?? ((await withTimeout(provider.estimateGas(request), 20000, "Gas estimate timed out.")) * 120n) / 100n;
    const fee = prepared.fee ?? selectFee(await provider.getFeeData());
    const balance = await provider.getBalance(signer.address);
    if (balance < prepared.value + gasLimit * fee.cap) {
      throw new Error(`Insufficient ${network.symbol} for the amount and maximum network fee.`);
    }
    const response = await signer.sendTransaction({
      ...request,
      gasLimit,
      chainId: network.chainId,
      ...(fee.kind === "eip1559" ? { maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas } : { gasPrice: fee.gasPrice })
    });
    await afterSend(signer.address, network, prepared, response.hash, opts.origin);
    return response.hash;
  } finally {
    provider.destroy();
  }
}

/** Local bookkeeping. Failures here must never report a broadcast tx as failed. */
async function afterSend(owner: string, network: EvmNetwork, prepared: PreparedTransaction, hash: string, origin: string) {
  try {
    await recordTransaction({
      hash,
      chainId: network.chainId,
      networkName: network.name,
      symbol: network.symbol,
      amount: formatEther(prepared.value),
      toAddress: prepared.to ?? "contract creation",
      fromAddress: owner,
      createdAt: new Date().toISOString(),
      status: "submitted"
    });
  } catch { /* history is best-effort */ }
  try {
    if (prepared.to) await recordInteraction(owner, network.chainId, prepared.to);
    const approval = decodeApprovalCall(prepared.data);
    if (approval && prepared.to) {
      if (approval.kind === "erc20" || approval.kind === "increaseAllowance") {
        const entry = { owner, chainId: network.chainId, token: prepared.to, spender: approval.spender, kind: "erc20" as const };
        // Keep revoked entries visible until the on-chain read confirms zero; the Open approvals screen refreshes them.
        await trackApproval({ ...entry, origin, txHash: hash });
      } else if (approval.kind === "permit2") {
        await trackApproval({ owner, chainId: network.chainId, token: approval.token, spender: approval.spender, kind: "permit2", origin, txHash: hash });
      } else if (approval.kind === "setApprovalForAll") {
        const entry = { owner, chainId: network.chainId, token: prepared.to, spender: approval.operator, kind: "nft-all" as const };
        if (approval.approved) await trackApproval({ ...entry, origin, txHash: hash });
        else await forgetApproval(entry);
      }
    }
  } catch { /* tracking is best-effort */ }
}
