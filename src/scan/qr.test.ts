import { parseRecipientQr, parseWalletConnectQr, recipientWarnings } from "./qr";

const ADDR = "0x52908400098527886E0F7030069857D2E4169EE7"; // EIP-55 test vector
const LOWER = ADDR.toLowerCase();
const TOKEN = "0x8617E340B3D01FA5F11F306F4090FD50E238070D";
const future = Math.floor(Date.now() / 1000) + 300;
const WC = `wc:0ef014a8b3ab95869da2c14a9f1b47d8f67ab8d779cb7714ef3319d1e950e803@2?expiryTimestamp=${future}&relay-protocol=irn&symKey=${"cd".repeat(32)}`;

describe("recipient QR parsing", () => {
  it("accepts bare addresses and checksums them", () => {
    expect(parseRecipientQr(` ${LOWER}\n`)).toEqual({ address: ADDR, chainId: null, tokenContract: null });
  });
  it("rejects a mixed-case address with a bad checksum", () => {
    expect(() => parseRecipientQr("0x52908400098527886E0F7030069857D2E4169Ee7")).toThrow(/valid EVM address/);
  });
  it("parses EIP-681 native payment links with chain", () => {
    expect(parseRecipientQr(`ethereum:${LOWER}@84532?value=1e16`)).toEqual({ address: ADDR, chainId: 84532, tokenContract: null });
    expect(parseRecipientQr(`ethereum:pay-${LOWER}`)).toMatchObject({ address: ADDR, chainId: null });
  });
  it("parses ERC-20 transfer requests and returns the recipient, not the token", () => {
    expect(parseRecipientQr(`ethereum:${TOKEN}@1/transfer?address=${LOWER}&uint256=1`)).toEqual({ address: ADDR, chainId: 1, tokenContract: TOKEN });
  });
  it.each([
    ["", /empty/],
    ["hello", /not an EVM address/],
    [WC, /WalletConnect code/],
    [`ethereum:${TOKEN}/approve?address=${LOWER}&uint256=1`, /only accepts plain payment/],
    [`ethereum:${TOKEN}/transfer?uint256=1`, /no recipient/],
    [`ethereum:${LOWER}@0`, /invalid chain/],
    ["0x" + "a".repeat(5000), /too long/]
  ])("rejects %s", (raw, message) => {
    expect(() => parseRecipientQr(raw)).toThrow(message);
  });
});

describe("WalletConnect QR parsing", () => {
  it("accepts raw and deep-linked pairing URIs", () => {
    expect(parseWalletConnectQr(WC)).toBe(WC);
    expect(parseWalletConnectQr(`trexwallet://wc?uri=${encodeURIComponent(WC)}`)).toBe(WC);
  });
  it("explains when an address QR is scanned instead", () => {
    expect(() => parseWalletConnectQr(LOWER)).toThrow(/address QR/);
    expect(() => parseWalletConnectQr("https://example.org")).toThrow(/not a WalletConnect/);
  });
});

describe("recipient warnings", () => {
  const base = { chainId: 84532, chainName: "Base Sepolia" };
  it("warns on chain mismatch and token requests on a native send", () => {
    const warnings = recipientWarnings({ address: ADDR, chainId: 1, tokenContract: TOKEN }, base);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/chain 1/);
  });
  it("warns when a token QR names a different token", () => {
    expect(recipientWarnings({ address: ADDR, chainId: 84532, tokenContract: TOKEN }, { ...base, tokenContract: ADDR })).toHaveLength(1);
    expect(recipientWarnings({ address: ADDR, chainId: 84532, tokenContract: TOKEN }, { ...base, tokenContract: TOKEN.toLowerCase() })).toHaveLength(0);
  });
});
