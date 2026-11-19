import { Contract, formatUnits, MaxUint256 } from "ethers";
import type { EvmNetwork } from "../config/networks";
import { PERMIT2_ADDRESS } from "../security/typedData";
import type { TrackedApproval } from "./localStore";
import { assertChain, errorMessage, providerFor, withTimeout } from "./rpc";

const ERC20 = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)"
];
const PERMIT2 = ["function allowance(address user, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)"];
const NFT = ["function isApprovedForAll(address owner, address operator) view returns (bool)", "function name() view returns (string)"];

export type TokenInfo = { symbol: string; decimals: number; balance: bigint };

/** Reads symbol, decimals and the owner's balance. Returns null if the contract does not answer like an ERC-20. */
export async function readTokenInfo(network: EvmNetwork, token: string, owner: string): Promise<TokenInfo | null> {
  const provider = providerFor(network);
  try {
    await assertChain(provider, network);
    const contract = new Contract(token, ERC20, provider);
    const [symbol, decimals, balance] = await withTimeout(Promise.all([
      contract.getFunction("symbol")().catch(() => "TOKEN"),
      contract.getFunction("decimals")(),
      contract.getFunction("balanceOf")(owner)
    ]), 15000, "Token lookup timed out.");
    const d = Number(decimals);
    if (!Number.isInteger(d) || d < 0 || d > 36) return null;
    return { symbol: String(symbol).slice(0, 16), decimals: d, balance: BigInt(balance) };
  } catch {
    return null;
  } finally {
    provider.destroy();
  }
}

export type ApprovalStatus = TrackedApproval & {
  label: string;
  amountText: string;
  active: boolean;
  unlimited: boolean;
  expiresAt: number | null;
  error?: string;
};

/** Reads the current on-chain state of each approval granted through TREX. */
export async function readApprovalStatuses(network: EvmNetwork, approvals: TrackedApproval[]): Promise<ApprovalStatus[]> {
  if (approvals.length === 0) return [];
  const provider = providerFor(network);
  try {
    await assertChain(provider, network);
    return await Promise.all(approvals.map(async (approval): Promise<ApprovalStatus> => {
      try {
        if (approval.kind === "erc20") {
          const contract = new Contract(approval.token, ERC20, provider);
          const [allowance, symbol, decimals] = await withTimeout(Promise.all([
            contract.getFunction("allowance")(approval.owner, approval.spender),
            contract.getFunction("symbol")().catch(() => "TOKEN"),
            contract.getFunction("decimals")().catch(() => 18n)
          ]), 15000, "Allowance read timed out.");
          const value = BigInt(allowance);
          const unlimited = value >= MaxUint256 / 2n;
          return { ...approval, label: String(symbol), unlimited, active: value > 0n, expiresAt: null, amountText: unlimited ? "Unlimited" : `${formatUnits(value, Number(decimals))} ${symbol}` };
        }
        if (approval.kind === "permit2") {
          const permit2 = new Contract(PERMIT2_ADDRESS, PERMIT2, provider);
          const token = new Contract(approval.token, ERC20, provider);
          const [[amount, expiration], symbol, decimals] = await withTimeout(Promise.all([
            permit2.getFunction("allowance")(approval.owner, approval.token, approval.spender),
            token.getFunction("symbol")().catch(() => "TOKEN"),
            token.getFunction("decimals")().catch(() => 18n)
          ]), 15000, "Permit2 read timed out.");
          const value = BigInt(amount);
          const expiresAt = Number(expiration);
          const expired = expiresAt > 0 && expiresAt * 1000 < Date.now();
          const unlimited = value >= ((1n << 160n) - 1n) / 2n;
          return { ...approval, label: `${symbol} via Permit2`, unlimited, active: value > 0n && !expired, expiresAt, amountText: unlimited ? "Unlimited" : `${formatUnits(value, Number(decimals))} ${symbol}` };
        }
        const nft = new Contract(approval.token, NFT, provider);
        const [approved, name] = await withTimeout(Promise.all([
          nft.getFunction("isApprovedForAll")(approval.owner, approval.spender),
          nft.getFunction("name")().catch(() => "Collection")
        ]), 15000, "Collection read timed out.");
        return { ...approval, label: String(name), unlimited: Boolean(approved), active: Boolean(approved), expiresAt: null, amountText: approved ? "All items" : "None" };
      } catch (error) {
        return { ...approval, label: "Unknown", unlimited: false, active: true, expiresAt: null, amountText: "Could not read", error: errorMessage(error, "Read failed") };
      }
    }));
  } finally {
    provider.destroy();
  }
}
