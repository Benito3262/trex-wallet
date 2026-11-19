import { MaxUint256, getAddress, isAddress } from "ethers";

/** Canonical Uniswap Permit2 deployment (same address on all supported chains). */
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

const MAX_UINT160 = (1n << 160n) - 1n;
const MAX_UINT48 = (1n << 48n) - 1n;

export type TypedDataPayload = {
  domain: Record<string, unknown>;
  types: Record<string, { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

export type PermitKind = "eip2612" | "dai" | "permit2-single" | "permit2-batch" | "permit2-transfer";

export type PermitGrant = {
  token: string | null;
  amount: bigint | null;
  unlimited: boolean;
  expiry: number | null;
};

export type DecodedPermit = {
  kind: PermitKind;
  label: string;
  spender: string;
  owner: string | null;
  grants: PermitGrant[];
  /** Signature deadline (seconds since epoch) when present. */
  deadline: number | null;
  verifyingContract: string | null;
};

export type TypedDataSummary = {
  payload: TypedDataPayload;
  chainId: number | null;
  verifyingContract: string | null;
  permit: DecodedPermit | null;
};

/** Parses eth_signTypedData_v4 input (JSON string or object) and validates its shape. */
export function parseTypedData(input: unknown): TypedDataPayload {
  let value: unknown = input;
  if (typeof input === "string") {
    try { value = JSON.parse(input); } catch { throw new Error("The site sent typed data that is not valid JSON."); }
  }
  if (!value || typeof value !== "object") throw new Error("The site sent invalid typed data.");
  const data = value as Partial<TypedDataPayload>;
  if (!data.types || typeof data.types !== "object") throw new Error("Typed data is missing its types.");
  if (typeof data.primaryType !== "string" || !data.types[data.primaryType]) throw new Error("Typed data has an unknown primary type.");
  if (!data.message || typeof data.message !== "object") throw new Error("Typed data is missing its message.");
  return {
    domain: (data.domain && typeof data.domain === "object" ? data.domain : {}) as Record<string, unknown>,
    types: data.types as TypedDataPayload["types"],
    primaryType: data.primaryType,
    message: data.message as Record<string, unknown>
  };
}

function toBigInt(value: unknown): bigint | null {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
    if (typeof value === "string" && value.trim() !== "") return BigInt(value.trim());
  } catch { /* fall through */ }
  return null;
}

function toSeconds(value: unknown): number | null {
  const big = toBigInt(value);
  if (big === null) return null;
  return big > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(big);
}

function addr(value: unknown): string | null {
  return typeof value === "string" && isAddress(value) ? getAddress(value) : null;
}

function fieldNames(payload: TypedDataPayload, type: string): Set<string> {
  return new Set((payload.types[type] ?? []).map((field) => field.name));
}

/** Detects and decodes token-spending permits: EIP-2612, DAI-style and Permit2. */
export function decodePermit(payload: TypedDataPayload): DecodedPermit | null {
  const { primaryType, message, domain } = payload;
  const verifyingContract = addr(domain.verifyingContract);
  const fields = fieldNames(payload, primaryType);
  const isPermit2Domain = verifyingContract?.toLowerCase() === PERMIT2_ADDRESS.toLowerCase() || domain.name === "Permit2";

  if (primaryType === "PermitSingle" && isPermit2Domain) {
    const details = (message.details ?? {}) as Record<string, unknown>;
    const amount = toBigInt(details.amount);
    const spender = addr(message.spender);
    if (!spender) return null;
    return {
      kind: "permit2-single",
      label: "Permit2 allowance",
      spender,
      owner: null,
      grants: [{ token: addr(details.token), amount, unlimited: amount === MAX_UINT160, expiry: toSeconds(details.expiration) }],
      deadline: toSeconds(message.sigDeadline),
      verifyingContract
    };
  }

  if (primaryType === "PermitBatch" && isPermit2Domain) {
    const spender = addr(message.spender);
    if (!spender || !Array.isArray(message.details)) return null;
    return {
      kind: "permit2-batch",
      label: "Permit2 batch allowance",
      spender,
      owner: null,
      grants: (message.details as Record<string, unknown>[]).map((detail) => {
        const amount = toBigInt(detail?.amount);
        return { token: addr(detail?.token), amount, unlimited: amount === MAX_UINT160, expiry: toSeconds(detail?.expiration) };
      }),
      deadline: toSeconds(message.sigDeadline),
      verifyingContract
    };
  }

  if ((primaryType === "PermitTransferFrom" || primaryType === "PermitWitnessTransferFrom" || primaryType === "PermitBatchTransferFrom" || primaryType === "PermitBatchWitnessTransferFrom") && isPermit2Domain) {
    const spender = addr(message.spender);
    if (!spender) return null;
    const permitted = Array.isArray(message.permitted) ? message.permitted : [message.permitted];
    return {
      kind: "permit2-transfer",
      label: "Permit2 signature transfer",
      spender,
      owner: null,
      grants: (permitted as Record<string, unknown>[]).map((item) => {
        const amount = toBigInt(item?.amount);
        return { token: addr(item?.token), amount, unlimited: amount === MaxUint256, expiry: null };
      }),
      deadline: toSeconds(message.deadline),
      verifyingContract
    };
  }

  if (primaryType === "Permit" && fields.has("spender")) {
    const spender = addr(message.spender);
    if (!spender) return null;
    if (fields.has("allowed")) {
      // DAI-style permit: allowed=true grants an unlimited allowance.
      const allowed = message.allowed === true || message.allowed === "true";
      return {
        kind: "dai",
        label: "DAI-style permit",
        spender,
        owner: addr(message.holder),
        grants: [{ token: verifyingContract, amount: allowed ? MaxUint256 : 0n, unlimited: allowed, expiry: null }],
        deadline: toSeconds(message.expiry),
        verifyingContract
      };
    }
    if (fields.has("value")) {
      const amount = toBigInt(message.value);
      return {
        kind: "eip2612",
        label: "ERC-20 permit (EIP-2612)",
        spender,
        owner: addr(message.owner),
        grants: [{ token: verifyingContract, amount, unlimited: amount === MaxUint256, expiry: null }],
        deadline: toSeconds(message.deadline),
        verifyingContract
      };
    }
  }
  return null;
}

export function summarizeTypedData(input: unknown): TypedDataSummary {
  const payload = parseTypedData(input);
  const chainIdValue = toBigInt(payload.domain.chainId);
  return {
    payload,
    chainId: chainIdValue === null ? null : Number(chainIdValue),
    verifyingContract: addr(payload.domain.verifyingContract),
    permit: decodePermit(payload)
  };
}

export function isFarFuture(seconds: number | null, nowSeconds: number, days = 30): boolean {
  if (seconds === null) return false;
  if (BigInt(seconds) >= MAX_UINT48 || seconds >= Number.MAX_SAFE_INTEGER) return true;
  return seconds - nowSeconds > days * 86400;
}

/** Types without EIP712Domain, as required by ethers' signTypedData. */
export function typesForSigning(payload: TypedDataPayload): Record<string, { name: string; type: string }[]> {
  const { EIP712Domain: _domain, ...rest } = payload.types;
  return rest;
}
