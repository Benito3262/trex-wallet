import { formatEther, formatUnits } from "ethers";
import { MAINNET_SIGNING_BLOCKED_MESSAGE, isTestnet, networkByChainId } from "../config/networks";
import type { RiskLevel, TransactionAnalysis } from "./analyzeTransaction";
import type { ApprovalCall } from "./approvalRewrite";
import { isFarFuture, type TypedDataSummary } from "./typedData";

export type Finding = { level: RiskLevel; title: string; detail: string };

export type SimulationResult = {
  /** "success" when eth_call returned, "reverted" when it reverted, "unavailable" when the RPC failed. */
  status: "success" | "reverted" | "unavailable";
  revertReason?: string;
  error?: string;
  gasLimit?: bigint;
  maxFee?: bigint;
  balance?: bigint;
  value: bigint;
  insufficientFunds: boolean;
  toIsContract: boolean | null;
};

export type Review = { level: RiskLevel; findings: Finding[]; blockedReason: string | null };

const ORDER: RiskLevel[] = ["info", "warning", "high", "critical"];
const maxLevel = (findings: Finding[]): RiskLevel =>
  findings.reduce<RiskLevel>((acc, f) => (ORDER.indexOf(f.level) > ORDER.indexOf(acc) ? f.level : acc), "info");

export const SIMULATION_LIMITATIONS =
  "Simulation and checks are best-effort, not a guarantee. They run against the current chain state through a public RPC, can miss malicious behaviour that depends on timing or other transactions, and cannot prove a contract or site is safe.";

function chainName(chainId: number) {
  return networkByChainId(chainId)?.name ?? `chain ${chainId}`;
}

function short(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

function formatExpiry(seconds: number | null, nowSeconds: number): string {
  if (seconds === null) return "no expiry field";
  if (isFarFuture(seconds, nowSeconds, 365 * 50)) return "never (maximum value)";
  if (seconds === 0) return "0 (immediate)";
  const date = new Date(seconds * 1000).toISOString().replace("T", " ").slice(0, 16);
  return seconds < nowSeconds ? `${date} UTC (already passed)` : `${date} UTC`;
}

export function reviewTransaction(input: {
  activeChainId: number;
  requestedChainId?: number | null;
  to: string | null;
  data?: string;
  analysis: TransactionAnalysis;
  approval: ApprovalCall | null;
  simulation: SimulationResult | null;
  firstInteraction: boolean | null;
  symbol: string;
  tokenDecimals?: number | null;
  tokenSymbol?: string | null;
}): Review {
  const findings: Finding[] = [];
  let blockedReason: string | null = null;
  const { activeChainId, requestedChainId, simulation, approval } = input;

  if (!isTestnet(activeChainId)) blockedReason = MAINNET_SIGNING_BLOCKED_MESSAGE;
  if (requestedChainId && requestedChainId !== activeChainId) {
    findings.push({ level: "critical", title: "Chain mismatch", detail: `The site built this for ${chainName(requestedChainId)}, but TREX is on ${chainName(activeChainId)}.` });
    blockedReason = blockedReason ?? `Chain mismatch: the request is for ${chainName(requestedChainId)} but the wallet is on ${chainName(activeChainId)}. Switch networks and ask the site to try again.`;
  }

  if (approval?.kind === "erc20" || approval?.kind === "increaseAllowance") {
    const amount = approval.unlimited
      ? "UNLIMITED"
      : input.tokenDecimals != null ? `${formatUnits(approval.amount, input.tokenDecimals)} ${input.tokenSymbol ?? ""}`.trim() : approval.amount.toString();
    if (approval.amount === 0n && approval.kind === "erc20") {
      findings.push({ level: "info", title: "Revokes an allowance", detail: `Sets the allowance for ${short(approval.spender)} to zero.` });
    } else {
      findings.push({
        level: approval.unlimited ? "critical" : "high",
        title: approval.unlimited ? "Unlimited token approval" : "Token approval",
        detail: `${short(approval.spender)} will be able to move ${amount} of this token from your wallet at any time${approval.unlimited ? " until you revoke it" : ""}.`
      });
    }
  }
  if (approval?.kind === "permit2") {
    findings.push({
      level: approval.amount === 0n ? "info" : approval.unlimited ? "critical" : "high",
      title: approval.amount === 0n ? "Revokes a Permit2 allowance" : approval.unlimited ? "Unlimited Permit2 allowance" : "Permit2 allowance",
      detail: `Spender ${short(approval.spender)} on token ${short(approval.token)}. Expires: ${formatExpiry(approval.expiration, Math.floor(Date.now() / 1000))}.`
    });
  }
  if (approval?.kind === "setApprovalForAll") {
    findings.push(approval.approved
      ? { level: "critical", title: "Access to ALL items in a collection", detail: `${short(approval.operator)} could transfer every NFT you own in this collection. Only approve marketplaces you trust.` }
      : { level: "info", title: "Removes collection access", detail: `Turns off operator access for ${short(approval.operator)}.` });
  }
  if (!approval && input.analysis.method !== "Native transfer or empty call") {
    findings.push({ level: input.analysis.riskLevel, title: input.analysis.method, detail: input.analysis.summary });
  }

  if (input.to === null) {
    findings.push({ level: "warning", title: "Deploys a new contract", detail: "This transaction creates a contract. Only continue if you meant to deploy one." });
  }

  if (simulation) {
    if (simulation.status === "reverted") {
      findings.push({ level: "high", title: "Simulation: transaction would fail", detail: simulation.revertReason ? `Reverted: ${simulation.revertReason}` : "The contract reverted without a reason. You would still pay the network fee." });
    } else if (simulation.status === "unavailable") {
      findings.push({ level: "warning", title: "Simulation unavailable", detail: simulation.error ? `The RPC could not simulate this: ${simulation.error}` : "The RPC could not simulate this transaction." });
    } else {
      findings.push({ level: "info", title: "Simulation: succeeds", detail: "A dry run against the current chain state did not revert." });
    }
    if (simulation.insufficientFunds) {
      const needed = simulation.value + (simulation.maxFee ?? 0n);
      blockedReason = blockedReason ?? `Not enough ${input.symbol}: this needs up to ${formatEther(needed)} ${input.symbol} (amount + maximum fee) but the account holds ${formatEther(simulation.balance ?? 0n)}.`;
      findings.push({ level: "high", title: "Insufficient balance", detail: "Your balance does not cover the amount plus the maximum network fee." });
    }
    if (input.to && simulation.toIsContract !== null) {
      if (simulation.toIsContract) {
        findings.push({ level: "info", title: "Destination is a contract", detail: `${short(input.to)} has contract code.` });
      } else if (input.data && input.data !== "0x") {
        findings.push({ level: "warning", title: "Data sent to a regular address", detail: `${short(input.to)} is not a contract (EOA), but the site attached call data. Check the address.` });
      } else {
        findings.push({ level: "info", title: "Destination is a regular address", detail: `${short(input.to)} is an externally owned account (EOA), not a contract.` });
      }
    }
  }

  if (input.firstInteraction && input.to) {
    findings.push({ level: "warning", title: "First interaction", detail: `This account has not interacted with ${short(input.to)} through TREX before. Double-check the address.` });
  }

  return { level: blockedReason ? "critical" : maxLevel(findings), findings, blockedReason };
}

export function reviewTypedData(input: { activeChainId: number; summary: TypedDataSummary; nowSeconds: number; origin: string }): Review {
  const findings: Finding[] = [];
  let blockedReason: string | null = null;
  const { summary, activeChainId, nowSeconds } = input;

  if (!isTestnet(activeChainId)) blockedReason = MAINNET_SIGNING_BLOCKED_MESSAGE;
  if (summary.chainId !== null && summary.chainId !== activeChainId) {
    findings.push({ level: "critical", title: "Chain mismatch", detail: `The signature is for ${chainName(summary.chainId)}, but TREX is on ${chainName(activeChainId)}.` });
    blockedReason = blockedReason ?? `Chain mismatch: this signature is for ${chainName(summary.chainId)}, not ${chainName(activeChainId)}.`;
  }
  if (summary.chainId !== null && !isTestnet(summary.chainId)) {
    blockedReason = blockedReason ?? MAINNET_SIGNING_BLOCKED_MESSAGE;
  }
  if (summary.chainId === null) {
    findings.push({ level: "warning", title: "No chain in signature", detail: "This typed data has no chainId, so it could be replayed on another network." });
  }

  const permit = summary.permit;
  if (permit) {
    for (const grant of permit.grants) {
      const amount = grant.unlimited ? "UNLIMITED" : grant.amount === null ? "unknown amount" : `${grant.amount.toString()} (raw units)`;
      findings.push({
        level: grant.amount === 0n ? "info" : grant.unlimited ? "critical" : "high",
        title: `${permit.label}: ${grant.unlimited ? "unlimited spending" : "token spending"}`,
        detail: `Spender ${short(permit.spender)} · token ${grant.token ? short(grant.token) : "unknown"} · amount ${amount} · allowance expiry ${formatExpiry(grant.expiry, nowSeconds)}.`
      });
      if (grant.expiry !== null && isFarFuture(grant.expiry, nowSeconds)) {
        findings.push({ level: "warning", title: "Long-lived permission", detail: "The allowance stays valid for more than 30 days." });
      }
    }
    findings.push({ level: "warning", title: "Off-chain signature", detail: `This signature can be submitted later by anyone holding it. Signature deadline: ${formatExpiry(permit.deadline, nowSeconds)}.` });
  } else {
    findings.push({ level: "info", title: `Typed data: ${summary.payload.primaryType}`, detail: summary.verifyingContract ? `Verifying contract ${short(summary.verifyingContract)}.` : "No verifying contract." });
  }
  return { level: blockedReason ? "critical" : maxLevel(findings), findings, blockedReason };
}

/** Extracts the domain from an EIP-4361 (Sign-In with Ethereum) message, if any. */
export function siweDomain(message: string): string | null {
  const match = /^(\S+) wants you to sign in with your Ethereum account:/m.exec(message);
  return match ? match[1] : null;
}

export function reviewMessage(input: { activeChainId: number; displayMessage: string; rawMessage: string; origin: string }): Review {
  const findings: Finding[] = [];
  let blockedReason: string | null = null;
  if (!isTestnet(input.activeChainId)) blockedReason = MAINNET_SIGNING_BLOCKED_MESSAGE;
  const domain = siweDomain(input.displayMessage);
  if (domain) {
    let host = input.origin;
    try { host = new URL(input.origin).host; } catch { /* WalletConnect origins may be plain names */ }
    if (host && domain.toLowerCase() !== host.toLowerCase()) {
      findings.push({ level: "critical", title: "Sign-in domain mismatch", detail: `The message is for ${domain}, but the request came from ${host}. This is a common phishing pattern.` });
    } else {
      findings.push({ level: "info", title: "Sign-in request", detail: `Signs you in to ${domain}. It does not move funds.` });
    }
  } else if (input.displayMessage === input.rawMessage && /^0x[0-9a-fA-F]+$/.test(input.rawMessage)) {
    findings.push({ level: "warning", title: "Unreadable message", detail: "The message is raw bytes, not text. Only sign if you trust the site." });
  } else {
    findings.push({ level: "info", title: "Message signature", detail: "Signing a plain message does not send a transaction." });
  }
  return { level: blockedReason ? "critical" : maxLevel(findings), findings, blockedReason };
}
