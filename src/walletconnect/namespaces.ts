import { NETWORKS } from "../config/networks";

export const WC_METHODS = [
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData_v4",
  "eth_signTypedData",
  "wallet_switchEthereumChain",
  "wallet_addEthereumChain",
  "eth_accounts",
  "eth_requestAccounts",
  "eth_chainId"
];
export const WC_EVENTS = ["accountsChanged", "chainChanged"];

export function supportedChains(): string[] {
  return NETWORKS.map((network) => `eip155:${network.chainId}`);
}

/** Namespaces TREX offers to a dApp: every built-in chain, the active account, the methods it can review. */
export function supportedNamespaces(address: string) {
  const chains = supportedChains();
  return {
    eip155: {
      chains,
      methods: WC_METHODS,
      events: WC_EVENTS,
      accounts: chains.map((chain) => `${chain}:${address}`)
    }
  };
}

/** "eip155:84532" -> 84532; null for anything else. */
export function parseCaipChain(value: string | undefined | null): number | null {
  const match = /^eip155:(\d+)$/.exec(value ?? "");
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Validates a pasted pairing URI (WalletConnect v2 only). Returns the trimmed URI. */
export function validatePairingUri(input: string): string {
  const uri = input.trim();
  if (!uri.startsWith("wc:")) throw new Error("A WalletConnect link starts with \"wc:\". Copy it from the site's WalletConnect QR or \"Copy link\" option.");
  const version = /^wc:[0-9a-f]+@(\d+)/i.exec(uri)?.[1];
  if (version !== "2") throw new Error("This is not a WalletConnect v2 link. Ask the site for a new one.");
  if (!/[?&]symKey=/.test(uri) || !/[?&]relay-protocol=/.test(uri)) throw new Error("This WalletConnect link is incomplete. Copy the whole link again.");
  const expiry = /[?&]expiryTimestamp=(\d+)/.exec(uri)?.[1];
  if (expiry && Number(expiry) * 1000 < Date.now()) throw new Error("This WalletConnect link has expired. Refresh the QR on the site and copy a new one.");
  return uri;
}

/** Turns a deep link like trexwallet://wc?uri=wc%3A... into the inner pairing URI. */
export function pairingUriFromDeepLink(url: string): string | null {
  if (url.startsWith("wc:")) return url;
  const match = /^trexwallet:\/\/wc\?uri=(.+)$/.exec(url);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}
