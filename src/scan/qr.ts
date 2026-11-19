import { getAddress, isAddress } from "ethers";
import { pairingUriFromDeepLink, validatePairingUri } from "../walletconnect/namespaces";

/** What a scanned payment QR asked for. Only the recipient is ever filled in automatically. */
export type ScannedRecipient = {
  address: string;
  /** Chain requested by an EIP-681 link (ethereum:0x..@8453), if any. */
  chainId: number | null;
  /** Set when the QR is an ERC-20 transfer request (ethereum:<token>/transfer?address=<recipient>). */
  tokenContract: string | null;
};

const MAX_QR_LENGTH = 4096;

function checksum(value: string): string {
  // ethers rejects mixed-case addresses with a bad checksum, which catches mistyped or tampered codes.
  if (!isAddress(value)) throw new Error("The QR code does not contain a valid EVM address.");
  return getAddress(value);
}

/**
 * Parses a recipient QR: a bare 0x address, or an EIP-681 link such as
 * `ethereum:0xabc…@8453?value=1e16` or `ethereum:0xToken@1/transfer?address=0xabc…&uint256=1`.
 */
export function parseRecipientQr(raw: string): ScannedRecipient {
  const text = (raw ?? "").trim();
  if (!text || text.length > MAX_QR_LENGTH) throw new Error("This QR code is empty or too long to be an address.");
  if (/^0x[0-9a-fA-F]{40}$/.test(text)) return { address: checksum(text), chainId: null, tokenContract: null };

  const match = /^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40})(?:@(\d+))?(?:\/([A-Za-z_][A-Za-z0-9_]*))?(?:\?(.*))?$/i.exec(text);
  if (!match) {
    if (text.startsWith("wc:")) throw new Error("This is a WalletConnect code. Scan it from the WalletConnect screen instead.");
    throw new Error("This QR code is not an EVM address or ethereum: payment link.");
  }
  const [, target, chain, fn, query] = match;
  const chainId = chain ? Number(chain) : null;
  if (chainId !== null && (!Number.isSafeInteger(chainId) || chainId <= 0)) throw new Error("The QR code has an invalid chain ID.");
  if (!fn) return { address: checksum(target), chainId, tokenContract: null };
  if (fn !== "transfer") throw new Error(`This QR asks to call "${fn}" on a contract. TREX only accepts plain payment codes here.`);
  const recipient = new URLSearchParams(query ?? "").get("address");
  if (!recipient) throw new Error("This token payment QR has no recipient address.");
  return { address: checksum(recipient), chainId, tokenContract: checksum(target) };
}

/** Accepts a raw wc: URI or a trexwallet://wc?uri= deep link from a QR and returns a validated pairing URI. */
export function parseWalletConnectQr(raw: string): string {
  const text = (raw ?? "").trim();
  if (!text || text.length > MAX_QR_LENGTH) throw new Error("This QR code is empty or too long.");
  const uri = pairingUriFromDeepLink(text);
  if (!uri) {
    if (/^(0x[0-9a-fA-F]{40}|ethereum:)/i.test(text)) throw new Error("This is an address QR, not a WalletConnect code.");
    throw new Error("This is not a WalletConnect QR code. Open WalletConnect on the site and scan its QR.");
  }
  return validatePairingUri(uri);
}

/** Human warnings to show after filling a scanned recipient. */
export function recipientWarnings(scan: ScannedRecipient, ctx: { chainId: number; chainName: string; tokenContract?: string | null }): string[] {
  const warnings: string[] = [];
  if (scan.chainId !== null && scan.chainId !== ctx.chainId) {
    warnings.push(`This QR is for chain ${scan.chainId}, but you are sending on ${ctx.chainName} (chain ${ctx.chainId}). Check the network with the recipient.`);
  }
  if (scan.tokenContract && !ctx.tokenContract) {
    warnings.push("This QR is a token payment request. You are sending the network's native asset, not that token.");
  }
  if (scan.tokenContract && ctx.tokenContract && scan.tokenContract.toLowerCase() !== ctx.tokenContract.toLowerCase()) {
    warnings.push(`This QR requests a different token (${scan.tokenContract}). Check that you are sending the right one.`);
  }
  return warnings;
}
