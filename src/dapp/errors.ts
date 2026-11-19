/** EIP-1193 / EIP-1474 provider errors. */
export class ProviderRpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "ProviderRpcError";
    this.code = code;
    this.data = data;
  }
}

export const ErrorCodes = {
  userRejected: 4001,
  unauthorized: 4100,
  unsupportedMethod: 4200,
  disconnected: 4900,
  chainDisconnected: 4901,
  unrecognizedChain: 4902,
  invalidParams: -32602,
  internal: -32603,
  resourceUnavailable: -32002
} as const;

export const userRejected = (message = "The request was rejected in TREX Wallet.") => new ProviderRpcError(ErrorCodes.userRejected, message);
export const unauthorized = (message = "Connect this site to TREX Wallet first.") => new ProviderRpcError(ErrorCodes.unauthorized, message);
export const unsupported = (method: string) => new ProviderRpcError(ErrorCodes.unsupportedMethod, `TREX Wallet does not support ${method}.`);
export const invalidParams = (message: string) => new ProviderRpcError(ErrorCodes.invalidParams, message);

/** Converts any thrown value into a serializable { code, message } for the page or WalletConnect. */
export function toRpcError(error: unknown): { code: number; message: string; data?: unknown } {
  if (error instanceof ProviderRpcError) return { code: error.code, message: error.message, ...(error.data === undefined ? {} : { data: error.data }) };
  if (error instanceof Error) {
    const raw = (error as unknown as { code?: unknown }).code;
    const code = typeof raw === "number" ? raw : ErrorCodes.internal;
    return { code, message: error.message.slice(0, 300) };
  }
  return { code: ErrorCodes.internal, message: "TREX Wallet request failed." };
}
