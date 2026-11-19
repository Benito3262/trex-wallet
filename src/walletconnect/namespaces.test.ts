import { buildApprovedNamespaces } from "@walletconnect/utils";
import { pairingUriFromDeepLink, parseCaipChain, supportedChains, supportedNamespaces, validatePairingUri } from "./namespaces";

const ADDRESS = "0x000000000000000000000000000000000000dEaD";
const future = Math.floor(Date.now() / 1000) + 300;
const good = `wc:0ef014a8b3ab95869da2c14a9f1b47d8f67ab8d779cb7714ef3319d1e950e803@2?expiryTimestamp=${future}&relay-protocol=irn&symKey=${"ab".repeat(32)}`;

describe("WalletConnect pairing URIs", () => {
  it("accepts a well-formed v2 link and trims whitespace", () => {
    expect(validatePairingUri(`  ${good}\n`)).toBe(good);
  });
  it.each([
    ["https://example.org", /starts with/],
    ["wc:abc@1?bridge=x&key=y", /not a WalletConnect v2/],
    ["wc:abcdef@2?relay-protocol=irn", /incomplete/],
    [`wc:abcdef@2?expiryTimestamp=1000&relay-protocol=irn&symKey=${"ab".repeat(32)}`, /expired/]
  ])("rejects %s", (uri, message) => {
    expect(() => validatePairingUri(uri)).toThrow(message);
  });
  it("extracts the URI from trexwallet:// deep links", () => {
    expect(pairingUriFromDeepLink(`trexwallet://wc?uri=${encodeURIComponent(good)}`)).toBe(good);
    expect(pairingUriFromDeepLink(good)).toBe(good);
    expect(pairingUriFromDeepLink("trexwallet://other")).toBeNull();
    expect(pairingUriFromDeepLink("trexwallet://wc?uri=%E0%A4%A")).toBeNull();
  });
});

describe("WalletConnect namespaces", () => {
  it("parses CAIP-2 chain ids strictly", () => {
    expect(parseCaipChain("eip155:84532")).toBe(84532);
    expect(parseCaipChain("eip155:0")).toBeNull();
    expect(parseCaipChain("solana:5eykt")).toBeNull();
    expect(parseCaipChain(undefined)).toBeNull();
  });
  it("offers every built-in chain including Robinhood testnet", () => {
    expect(supportedChains()).toEqual(expect.arrayContaining(["eip155:1", "eip155:11155111", "eip155:84532", "eip155:46630"]));
  });
  it("approves only the requested supported chains", () => {
    const proposal = {
      id: 1,
      expiryTimestamp: future,
      relays: [{ protocol: "irn" }],
      proposer: { publicKey: "00", metadata: { name: "dApp", description: "", url: "https://example.org", icons: [] } },
      requiredNamespaces: {},
      optionalNamespaces: { eip155: { chains: ["eip155:84532", "eip155:999999"], methods: ["personal_sign", "eth_sendTransaction"], events: ["chainChanged"] } },
      pairingTopic: "topic"
    };
    const approved = buildApprovedNamespaces({ proposal: proposal as never, supportedNamespaces: supportedNamespaces(ADDRESS) });
    expect(approved.eip155.chains).toEqual(["eip155:84532"]);
    expect(approved.eip155.accounts).toEqual([`eip155:84532:${ADDRESS}`]);
  });
  it("rejects proposals that require unsupported chains", () => {
    const proposal = {
      id: 1, expiryTimestamp: future, relays: [{ protocol: "irn" }], pairingTopic: "t",
      proposer: { publicKey: "00", metadata: { name: "dApp", description: "", url: "https://example.org", icons: [] } },
      requiredNamespaces: { eip155: { chains: ["eip155:999999"], methods: ["personal_sign"], events: [] } },
      optionalNamespaces: {}
    };
    expect(() => buildApprovedNamespaces({ proposal: proposal as never, supportedNamespaces: supportedNamespaces(ADDRESS) })).toThrow();
  });
});

describe("WalletConnect request lifetime", () => {
  const { requestTimeoutMs, DEFAULT_REQUEST_TTL_MS } = jest.requireActual("./namespaces");
  it("uses the default when no expiry is set", () => {
    expect(requestTimeoutMs(undefined, 0)).toBe(DEFAULT_REQUEST_TTL_MS);
    expect(requestTimeoutMs(Number.NaN, 0)).toBe(DEFAULT_REQUEST_TTL_MS);
  });
  it("follows the request expiry, clamped to [0, 30 min]", () => {
    expect(requestTimeoutMs(100, 40_000)).toBe(60_000);
    expect(requestTimeoutMs(10, 60_000)).toBe(0);
    expect(requestTimeoutMs(10_000_000, 0)).toBe(30 * 60_000);
  });
});
