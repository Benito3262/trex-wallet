import { ErrorCodes, ProviderRpcError } from "./errors";

export type BridgeMessage = { id: string; method: string; params: unknown };

/** Parses a postMessage payload from the injected provider. Returns null for anything else. */
export function parseBridgeMessage(data: string): BridgeMessage | null {
  if (typeof data !== "string" || data.length > 256_000) return null;
  let value: unknown;
  try { value = JSON.parse(data); } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (message.__trex !== 1 || typeof message.id !== "string" || typeof message.method !== "string") return null;
  if (message.id.length > 64 || message.method.length > 64) return null;
  return { id: message.id, method: message.method, params: message.params };
}

/** Origin of a page URL, or null when it is not http(s). */
export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/** Wallet access is only offered to HTTPS pages (and localhost for development). */
export function assertSecureOrigin(origin: string): void {
  const parsed = new URL(origin);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "10.0.2.2";
  if (parsed.protocol !== "https:" && !local) {
    throw new ProviderRpcError(ErrorCodes.unauthorized, "TREX Wallet only connects to secure (HTTPS) sites.");
  }
}
