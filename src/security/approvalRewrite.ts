import { Interface, MaxUint256, parseUnits } from "ethers";

const APPROVE = new Interface([
  "function approve(address spender,uint256 value)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  "function setApprovalForAll(address operator,bool approved)",
  "function increaseAllowance(address spender,uint256 addedValue)"
]);
const ERC20_APPROVE_SELECTOR = APPROVE.getFunction("approve(address,uint256)")!.selector;
const PERMIT2_APPROVE_SELECTOR = APPROVE.getFunction("approve(address,address,uint160,uint48)")!.selector;
const SET_APPROVAL_FOR_ALL_SELECTOR = APPROVE.getFunction("setApprovalForAll")!.selector;
const INCREASE_ALLOWANCE_SELECTOR = APPROVE.getFunction("increaseAllowance")!.selector;
const MAX_UINT160 = (1n << 160n) - 1n;

/** Treat anything at or above 2^255 as "unlimited"; dApps use several near-max values. */
const UNLIMITED_THRESHOLD = 1n << 255n;

export type ApprovalCall =
  | { kind: "erc20"; spender: string; amount: bigint; unlimited: boolean }
  | { kind: "increaseAllowance"; spender: string; amount: bigint; unlimited: boolean }
  | { kind: "permit2"; token: string; spender: string; amount: bigint; expiration: number; unlimited: boolean }
  | { kind: "setApprovalForAll"; operator: string; approved: boolean };

export function decodeApprovalCall(data: string | undefined | null): ApprovalCall | null {
  if (!data || data.length < 10) return null;
  const selector = data.slice(0, 10).toLowerCase();
  try {
    if (selector === ERC20_APPROVE_SELECTOR) {
      const [spender, amount] = APPROVE.decodeFunctionData("approve(address,uint256)", data);
      const value = BigInt(amount);
      return { kind: "erc20", spender: String(spender), amount: value, unlimited: value >= UNLIMITED_THRESHOLD };
    }
    if (selector === INCREASE_ALLOWANCE_SELECTOR) {
      const [spender, amount] = APPROVE.decodeFunctionData("increaseAllowance", data);
      const value = BigInt(amount);
      return { kind: "increaseAllowance", spender: String(spender), amount: value, unlimited: value >= UNLIMITED_THRESHOLD };
    }
    if (selector === PERMIT2_APPROVE_SELECTOR) {
      const [token, spender, amount, expiration] = APPROVE.decodeFunctionData("approve(address,address,uint160,uint48)", data);
      const value = BigInt(amount);
      return { kind: "permit2", token: String(token), spender: String(spender), amount: value, expiration: Number(expiration), unlimited: value >= MAX_UINT160 / 2n };
    }
    if (selector === SET_APPROVAL_FOR_ALL_SELECTOR) {
      const [operator, approved] = APPROVE.decodeFunctionData("setApprovalForAll", data);
      return { kind: "setApprovalForAll", operator: String(operator), approved: Boolean(approved) };
    }
  } catch {
    return null;
  }
  return null;
}

/** True when the calldata asks for an effectively unlimited ERC-20 / Permit2 allowance. */
export function isUnlimitedApproval(data: string | undefined | null): boolean {
  const call = decodeApprovalCall(data);
  return !!call && call.kind !== "setApprovalForAll" && call.unlimited;
}

/**
 * Re-encodes an approve call with an exact amount. The spender (and for
 * Permit2 the token and expiration) are kept, so only the amount changes.
 */
export function rewriteApprovalAmount(data: string, amount: bigint): string {
  if (amount < 0n) throw new Error("The approval amount cannot be negative.");
  const call = decodeApprovalCall(data);
  if (!call) throw new Error("This is not an approval TREX can rewrite.");
  if (call.kind === "erc20") {
    if (amount > MaxUint256) throw new Error("Amount is too large.");
    return APPROVE.encodeFunctionData("approve(address,uint256)", [call.spender, amount]);
  }
  if (call.kind === "permit2") {
    if (amount > MAX_UINT160) throw new Error("Amount is too large for Permit2.");
    return APPROVE.encodeFunctionData("approve(address,address,uint160,uint48)", [call.token, call.spender, amount, call.expiration]);
  }
  throw new Error("Only ERC-20 and Permit2 approve calls can be limited to an exact amount.");
}

/** Parses a user-typed token amount ("12.5") using the token's decimals. */
export function parseExactAmount(input: string, decimals: number): bigint {
  const value = input.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Enter an amount such as 25 or 12.5.");
  const fraction = value.split(".")[1];
  if (fraction && fraction.length > decimals) throw new Error(`This token supports up to ${decimals} decimal places.`);
  const parsed = parseUnits(value, decimals);
  if (parsed <= 0n) throw new Error("Enter an amount greater than zero.");
  return parsed;
}

/**
 * Best-effort inference of the amount a dApp needs: when the same request
 * batch or a follow-up transaction reveals the spend (e.g. transferFrom/
 * deposit amount), the caller passes it in. Without a hint we fall back to
 * the user's balance cap, never to "unlimited".
 */
export function suggestExactAmount(opts: { hint?: bigint | null; balance?: bigint | null }): bigint | null {
  if (opts.hint && opts.hint > 0n) return opts.hint;
  if (opts.balance && opts.balance > 0n) return opts.balance;
  return null;
}

export function encodeRevoke(call: ApprovalCall, tokenOrCollection?: string): { data: string } {
  if (call.kind === "erc20" || call.kind === "increaseAllowance") return { data: APPROVE.encodeFunctionData("approve(address,uint256)", [call.spender, 0n]) };
  if (call.kind === "permit2") return { data: APPROVE.encodeFunctionData("approve(address,address,uint160,uint48)", [tokenOrCollection ?? call.token, call.spender, 0n, 0]) };
  return { data: APPROVE.encodeFunctionData("setApprovalForAll", [call.operator, false]) };
}
