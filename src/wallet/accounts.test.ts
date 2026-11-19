import {
  LEGACY_SECRET_ID,
  activeAccount,
  addHdAccount,
  addSecretWithAccount,
  addressFromPrivateKey,
  deriveHdAccount,
  emptyRegistry,
  hdIndexFromPath,
  hdPath,
  migrateLegacyWallet,
  nextHdIndex,
  normalizePrivateKey,
  parseRegistry,
  removeAccount,
  renameAccount,
  setActiveAccount
} from "./accounts";

// Public Hardhat/Foundry test vector. Never use it for real funds.
const TEST_PHRASE = "test test test test test test test test test test test junk";
const NOW = "2026-11-19T00:00:00.000Z";

describe("HD derivation (m/44'/60'/0'/0/i)", () => {
  it("matches the well-known test vector addresses", () => {
    expect(deriveHdAccount(TEST_PHRASE, 0).address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(deriveHdAccount(TEST_PHRASE, 1).address).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
    expect(deriveHdAccount(TEST_PHRASE, 2).address).toBe("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
  });

  it("builds and parses address-index paths", () => {
    expect(hdPath(5)).toBe("m/44'/60'/0'/0/5");
    expect(hdIndexFromPath("m/44'/60'/0'/0/5")).toBe(5);
    expect(hdIndexFromPath("m/44'/60'/1'/0/0")).toBeNull();
    expect(() => hdPath(-1)).toThrow();
    expect(() => hdPath(1.5)).toThrow();
  });

  it("normalizes phrase spacing and case", () => {
    expect(deriveHdAccount("  TEST test   test test test test test test test test test junk ", 0).address)
      .toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  });

  it("validates private keys", () => {
    const key = "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    expect(normalizePrivateKey(key)).toBe(`0x${key}`);
    expect(addressFromPrivateKey(`0x${key}`)).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(() => normalizePrivateKey("0x1234")).toThrow();
  });
});

describe("multi-account registry", () => {
  function twoWallets() {
    let registry = addSecretWithAccount(emptyRegistry(), {
      secretId: "s1", accountId: "a1", kind: "mnemonic", address: deriveHdAccount(TEST_PHRASE, 0).address, derivationPath: hdPath(0), now: NOW
    });
    registry = addHdAccount(registry, { secretId: "s1", accountId: "a2", address: deriveHdAccount(TEST_PHRASE, 1).address, hdIndex: nextHdIndex(registry, "s1"), now: NOW });
    registry = addSecretWithAccount(registry, {
      secretId: "s2", accountId: "a3", kind: "privateKey", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", derivationPath: null, now: NOW
    });
    return registry;
  }

  it("adds HD accounts and imported keys with default names and makes the newest active", () => {
    const registry = twoWallets();
    expect(registry.accounts.map((a) => a.name)).toEqual(["Account 1", "Account 2", "Account 3"]);
    expect(registry.accounts[1].hdIndex).toBe(1);
    expect(registry.accounts[1].derivationPath).toBe("m/44'/60'/0'/0/1");
    expect(registry.accounts[2].hdIndex).toBeNull();
    expect(activeAccount(registry)?.id).toBe("a3");
    expect(registry.secrets.map((s) => s.label)).toEqual(["Recovery phrase 1", "Imported key 2"]);
  });

  it("rejects duplicate addresses and deriving from a private key", () => {
    const registry = twoWallets();
    expect(() => addSecretWithAccount(registry, {
      secretId: "s3", accountId: "a4", kind: "mnemonic", address: deriveHdAccount(TEST_PHRASE, 0).address, derivationPath: hdPath(0), now: NOW
    })).toThrow(/already/);
    expect(() => addHdAccount(registry, { secretId: "s2", accountId: "a5", address: deriveHdAccount(TEST_PHRASE, 3).address, hdIndex: 0, now: NOW })).toThrow();
  });

  it("fills gaps when choosing the next HD index", () => {
    const registry = twoWallets();
    const { registry: without0 } = removeAccount(registry, "a1");
    expect(nextHdIndex(without0, "s1")).toBe(0);
    expect(nextHdIndex(registry, "s1")).toBe(2);
  });

  it("renames with validation and switches the active account", () => {
    let registry = renameAccount(twoWallets(), "a2", "  Savings   wallet ");
    expect(registry.accounts[1].name).toBe("Savings wallet");
    expect(() => renameAccount(registry, "a2", "   ")).toThrow();
    expect(() => renameAccount(registry, "a2", "x".repeat(40))).toThrow();
    registry = setActiveAccount(registry, "a1");
    expect(activeAccount(registry)?.id).toBe("a1");
    expect(() => setActiveAccount(registry, "nope")).toThrow();
  });

  it("only reports a secret for deletion when its last account is removed", () => {
    const registry = setActiveAccount(twoWallets(), "a1");
    const first = removeAccount(registry, "a1");
    expect(first.orphanedSecretId).toBeNull();
    expect(first.registry.activeAccountId).toBe("a2");
    const second = removeAccount(first.registry, "a2");
    expect(second.orphanedSecretId).toBe("s1");
    expect(second.registry.secrets.map((s) => s.id)).toEqual(["s2"]);
    const last = removeAccount(second.registry, "a3");
    expect(last.orphanedSecretId).toBe("s2");
    expect(last.registry.activeAccountId).toBeNull();
  });

  it("migrates a single-wallet install without touching its secret", () => {
    const registry = migrateLegacyWallet("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", "m/44'/60'/0'/0/0", NOW);
    expect(registry.accounts).toHaveLength(1);
    expect(registry.accounts[0].secretId).toBe(LEGACY_SECRET_ID);
    expect(registry.accounts[0].address).toBe("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
    expect(registry.accounts[0].hdIndex).toBe(0);
    expect(registry.accounts[0].name).toBe("Main account");
    expect(nextHdIndex(registry, LEGACY_SECRET_ID)).toBe(1);
  });

  it("round-trips through JSON and rejects malformed data", () => {
    const registry = twoWallets();
    expect(parseRegistry(JSON.stringify(registry))).toEqual(registry);
    expect(parseRegistry("not json")).toBeNull();
    expect(parseRegistry(JSON.stringify({ version: 1 }))).toBeNull();
    const broken = parseRegistry(JSON.stringify({ ...registry, activeAccountId: "missing" }));
    expect(broken?.activeAccountId).toBe("a1");
  });

  it("never stores secret material in the registry", () => {
    const json = JSON.stringify(twoWallets());
    expect(json).not.toContain("test test");
    expect(json).not.toMatch(/[0-9a-f]{64}/i);
  });
});
