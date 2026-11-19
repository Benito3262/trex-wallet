import { getAddress, isAddress, isHexString, toUtf8String } from "ethers";
import { networkByChainId } from "../config/networks";
import { ErrorCodes, ProviderRpcError, invalidParams, unauthorized, unsupported, userRejected } from "./errors";

export type DappSource = "browser" | "walletconnect" | "internal";

export type DappTransaction = {
  from: string;
  to?: string | null;
  value?: string;
  data?: string;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: string;
  chainId?: string;
};

export type SignRequest =
  | { kind: "personal_sign"; address: string; message: string; displayMessage: string }
  | { kind: "typed_data"; address: string; typedData: unknown }
  | { kind: "transaction"; address: string; tx: DappTransaction };

export type RequestContext = {
  origin: string;
  source: DappSource;
  /** Active wallet address, or null when no account is available. */
  getActiveAddress(): string | null;
  getChainId(): number;
  /** True when this origin is connected to the active address. */
  isConnected(): boolean;
  /** Shows the connect sheet; resolves true when the user approves. */
  requestConnection(): Promise<boolean>;
  /** Shows the network switch sheet; resolves true when approved and switched. */
  requestChainSwitch(chainId: number): Promise<boolean>;
  /** Shows the review sheet. Resolves to the signature / tx hash, rejects with 4001 when declined. */
  requestSignature(request: SignRequest): Promise<string>;
  disconnect(): Promise<void>;
  /** Read-only JSON-RPC passthrough to the active chain's RPC. */
  readRpc(method: string, params: unknown[]): Promise<unknown>;
};

export const READ_ONLY_METHODS = new Set([
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getBlockTransactionCountByHash",
  "eth_getBlockTransactionCountByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getProof",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "eth_syncing"
]);

/** Methods that are deliberately refused because they sign opaque data or change wallet state silently. */
const BLOCKED_METHODS = new Set(["eth_sign", "eth_signTransaction", "eth_sendRawTransaction", "eth_signTypedData", "wallet_watchAsset", "eth_decrypt", "eth_getEncryptionPublicKey"]);

export function toHexChainId(chainId: number): string {
  return `0x${chainId.toString(16)}`;
}

export function parseChainId(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string") {
    const parsed = value.startsWith("0x") || value.startsWith("0X") ? Number.parseInt(value, 16) : Number.parseInt(value, 10);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  throw invalidParams("Invalid chainId.");
}

function asArray(params: unknown): unknown[] {
  if (params === undefined || params === null) return [];
  if (Array.isArray(params)) return params;
  return [params];
}

function sameAddress(a: unknown, b: string | null): boolean {
  return typeof a === "string" && !!b && isAddress(a) && a.toLowerCase() === b.toLowerCase();
}

/** Human-readable view of a personal_sign payload (hex-encoded UTF-8 or raw text). */
export function decodePersonalMessage(message: string): string {
  if (isHexString(message)) {
    try {
      const text = toUtf8String(message);
      // Show raw hex when the bytes are not printable text.
      if (/^[\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]*$/.test(text)) return text;
    } catch { /* not UTF-8 */ }
    return message;
  }
  return message;
}

function requireConnected(ctx: RequestContext): string {
  const address = ctx.getActiveAddress();
  if (!address || !ctx.isConnected()) throw unauthorized();
  return address;
}

function normalizeTransaction(raw: unknown, active: string): DappTransaction {
  if (!raw || typeof raw !== "object") throw invalidParams("eth_sendTransaction expects a transaction object.");
  const tx = raw as Record<string, unknown>;
  const from = typeof tx.from === "string" ? tx.from : active;
  if (!sameAddress(from, active)) throw unauthorized("The transaction 'from' address is not the connected TREX account.");
  if (tx.to !== undefined && tx.to !== null && (typeof tx.to !== "string" || !isAddress(tx.to))) throw invalidParams("Invalid 'to' address.");
  const hexField = (name: string): string | undefined => {
    const value = tx[name];
    if (value === undefined || value === null) return undefined;
    if (typeof value === "string" && isHexString(value)) return value;
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return `0x${value.toString(16)}`;
    throw invalidParams(`Invalid '${name}' field.`);
  };
  const data = tx.data ?? tx.input;
  if (data !== undefined && data !== null && (typeof data !== "string" || !isHexString(data))) throw invalidParams("Invalid 'data' field.");
  return {
    from: getAddress(active),
    to: typeof tx.to === "string" ? getAddress(tx.to) : null,
    value: hexField("value"),
    data: typeof data === "string" ? data : undefined,
    gas: hexField("gas") ?? hexField("gasLimit"),
    gasPrice: hexField("gasPrice"),
    maxFeePerGas: hexField("maxFeePerGas"),
    maxPriorityFeePerGas: hexField("maxPriorityFeePerGas"),
    nonce: hexField("nonce"),
    chainId: hexField("chainId")
  };
}

/**
 * Routes one EIP-1193 request. Connection, network switching and every
 * signature go through user-facing sheets supplied by the context; this
 * function never signs anything itself.
 */
export async function routeRequest(ctx: RequestContext, method: string, rawParams: unknown): Promise<unknown> {
  if (typeof method !== "string" || !method) throw invalidParams("Missing method.");
  const params = asArray(rawParams);

  switch (method) {
    case "eth_chainId":
      return toHexChainId(ctx.getChainId());
    case "net_version":
      return String(ctx.getChainId());
    case "web3_clientVersion":
      return "TREX Wallet/0.1";
    case "eth_accounts": {
      const address = ctx.getActiveAddress();
      return address && ctx.isConnected() ? [address] : [];
    }
    case "eth_coinbase": {
      const address = ctx.getActiveAddress();
      return address && ctx.isConnected() ? address : null;
    }
    case "eth_requestAccounts": {
      const address = ctx.getActiveAddress();
      if (!address) throw new ProviderRpcError(ErrorCodes.unauthorized, "Create or unlock a TREX wallet first.");
      if (ctx.isConnected()) return [address];
      const approved = await ctx.requestConnection();
      if (!approved) throw userRejected("The connection request was rejected.");
      const after = ctx.getActiveAddress();
      if (!after) throw unauthorized();
      return [after];
    }
    case "wallet_requestPermissions": {
      const request = params[0] as Record<string, unknown> | undefined;
      if (!request || typeof request !== "object" || !("eth_accounts" in request)) throw invalidParams("Only eth_accounts permission is supported.");
      await routeRequest(ctx, "eth_requestAccounts", []);
      return [{ parentCapability: "eth_accounts", invoker: ctx.origin, caveats: [] }];
    }
    case "wallet_getPermissions":
      return ctx.isConnected() ? [{ parentCapability: "eth_accounts", invoker: ctx.origin, caveats: [] }] : [];
    case "wallet_revokePermissions":
      await ctx.disconnect();
      return null;
    case "wallet_switchEthereumChain":
    case "wallet_addEthereumChain": {
      const arg = params[0] as { chainId?: unknown } | undefined;
      const chainId = parseChainId(arg?.chainId);
      if (!networkByChainId(chainId)) {
        if (method === "wallet_addEthereumChain") {
          throw new ProviderRpcError(ErrorCodes.unsupportedMethod, "TREX Wallet only supports its built-in networks.");
        }
        throw new ProviderRpcError(ErrorCodes.unrecognizedChain, `Chain ${chainId} is not supported by TREX Wallet.`);
      }
      if (chainId === ctx.getChainId()) return null;
      const switched = await ctx.requestChainSwitch(chainId);
      if (!switched) throw userRejected("The network switch was rejected.");
      return null;
    }
    case "personal_sign": {
      const active = requireConnected(ctx);
      // Spec order is [message, address]; some dApps send [address, message].
      let [message, address] = params as [unknown, unknown];
      if (sameAddress(message, active) && !sameAddress(address, active) && typeof address === "string") {
        [message, address] = [address, message];
      }
      if (typeof message !== "string") throw invalidParams("personal_sign expects a message string.");
      if (address !== undefined && !sameAddress(address, active)) throw unauthorized("personal_sign address is not the connected TREX account.");
      return ctx.requestSignature({ kind: "personal_sign", address: active, message, displayMessage: decodePersonalMessage(message) });
    }
    case "eth_signTypedData_v4":
    case "eth_signTypedData_v3": {
      const active = requireConnected(ctx);
      const [address, typedData] = params;
      if (!sameAddress(address, active)) throw unauthorized("The typed data address is not the connected TREX account.");
      if (typedData === undefined || typedData === null) throw invalidParams("Missing typed data.");
      return ctx.requestSignature({ kind: "typed_data", address: active, typedData });
    }
    case "eth_sendTransaction": {
      const active = requireConnected(ctx);
      const tx = normalizeTransaction(params[0], active);
      return ctx.requestSignature({ kind: "transaction", address: active, tx });
    }
    default:
      if (BLOCKED_METHODS.has(method)) throw unsupported(method);
      if (READ_ONLY_METHODS.has(method)) return ctx.readRpc(method, params);
      throw unsupported(method);
  }
}
