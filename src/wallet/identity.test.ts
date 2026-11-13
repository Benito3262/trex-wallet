import { deriveWalletFromPhrase } from "./identity";

const TEST_PHRASE = "test test test test test test test test test test test junk";

describe("EVM wallet derivation", () => {
  it("derives a valid EVM address at the standard first-account path", () => {
    const wallet = deriveWalletFromPhrase(TEST_PHRASE);
    expect(wallet.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(wallet.derivationPath).toBe("m/44'/60'/0'/0/0");
  });

  it("derives a distinct standard account path for another account index", () => {
    const first = deriveWalletFromPhrase(TEST_PHRASE, 0);
    const second = deriveWalletFromPhrase(TEST_PHRASE, 1);
    expect(second.derivationPath).toBe("m/44'/60'/1'/0/0");
    expect(second.address).not.toBe(first.address);
  });

  it("rejects invalid recovery phrases", () => {
    expect(() => deriveWalletFromPhrase("not a valid recovery phrase")).toThrow();
  });

  it("rejects invalid account indices", () => {
    expect(() => deriveWalletFromPhrase(TEST_PHRASE, -1)).toThrow();
    expect(() => deriveWalletFromPhrase(TEST_PHRASE, 1.5)).toThrow();
  });
});
