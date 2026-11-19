import * as SecureStore from "expo-secure-store";
import { HDNodeWallet, Mnemonic, Wallet, hexlify, randomBytes, type BaseWallet } from "ethers";
import type { WalletIdentity } from "./identity";
import {
  LEGACY_SECRET_ID,
  activeAccount,
  addHdAccount,
  addSecretWithAccount,
  deriveHdAccount,
  findAccount,
  migrateLegacyWallet,
  nextHdIndex,
  normalizePhrase,
  normalizePrivateKey,
  parseRegistry,
  removeAccount as removeAccountFromRegistry,
  renameAccount as renameAccountInRegistry,
  setActiveAccount as setActiveAccountInRegistry,
  type AccountMeta,
  type AccountRegistry,
  type WalletSecret
} from "./accounts";

/**
 * Storage layout
 * - trex.accounts.v2: public account registry (names, addresses, paths). No secrets.
 * - trex.secret.v2.<id>: one recovery phrase or private key, stored with
 *   requireAuthentication so Android asks for biometrics on every read.
 * - trex.wallet.v1: the original single-wallet entry. Existing installs keep
 *   it in place and it is referenced as the "legacy" secret, so upgrading
 *   never rewrites or loses the original recovery phrase.
 */
const LEGACY_VAULT_KEY = "trex.wallet.v1";
const PUBLIC_ADDRESS_KEY = "trex.wallet.public-address.v1";
const REGISTRY_KEY = "trex.accounts.v2";
const SECRET_PREFIX = "trex.secret.v2.";
const KEYCHAIN_SERVICE = "com.trexwallet.app.wallet";
const DEFAULT_PATH = "m/44'/60'/0'/0/0";

/** Shape of the original single-wallet vault entry. */
export type StoredWallet = WalletIdentity & {
  mnemonic: string;
  createdAt: string;
};

export type UnlockedAccount = { account: AccountMeta; signer: BaseWallet };

function newId(): string {
  return hexlify(randomBytes(8)).slice(2);
}

function authOptions(prompt: string): SecureStore.SecureStoreOptions {
  return { keychainService: KEYCHAIN_SERVICE, requireAuthentication: true, authenticationPrompt: prompt };
}

let registryCache: AccountRegistry | null = null;
const listeners = new Set<(registry: AccountRegistry) => void>();

export function subscribeRegistry(listener: (registry: AccountRegistry) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function writeRegistry(registry: AccountRegistry): Promise<AccountRegistry> {
  await SecureStore.setItemAsync(REGISTRY_KEY, JSON.stringify(registry));
  const active = activeAccount(registry);
  if (active) await SecureStore.setItemAsync(PUBLIC_ADDRESS_KEY, active.address);
  else await SecureStore.deleteItemAsync(PUBLIC_ADDRESS_KEY);
  registryCache = registry;
  listeners.forEach((listener) => listener(registry));
  return registry;
}

/**
 * Loads the public account registry without a biometric prompt. Migrates a
 * single-wallet install on first run by referencing the existing vault entry.
 */
export async function loadRegistry(): Promise<AccountRegistry | null> {
  if (registryCache) return registryCache;
  const parsed = parseRegistry(await SecureStore.getItemAsync(REGISTRY_KEY));
  if (parsed) { registryCache = parsed; return parsed; }
  const legacyAddress = await SecureStore.getItemAsync(PUBLIC_ADDRESS_KEY);
  if (!legacyAddress) return null;
  return writeRegistry(migrateLegacyWallet(legacyAddress, DEFAULT_PATH, new Date().toISOString()));
}

export async function getWalletAddress(): Promise<string | null> {
  const registry = await loadRegistry();
  return registry ? activeAccount(registry)?.address ?? null : null;
}

async function saveSecret(secretId: string, secret: WalletSecret): Promise<void> {
  await SecureStore.setItemAsync(`${SECRET_PREFIX}${secretId}`, JSON.stringify(secret), authOptions("Unlock TREX Wallet to protect this wallet"));
}

async function readLegacySecret(prompt: string): Promise<{ secret: WalletSecret; derivationPath: string; address: string } | null> {
  const payload = await SecureStore.getItemAsync(LEGACY_VAULT_KEY, authOptions(prompt));
  if (!payload) return null;
  const parsed = JSON.parse(payload) as Partial<StoredWallet>;
  if (typeof parsed.mnemonic !== "string" || typeof parsed.address !== "string" || typeof parsed.derivationPath !== "string") {
    throw new Error("The saved wallet data is invalid. Do not attempt to sign transactions.");
  }
  return { secret: { kind: "mnemonic", mnemonic: parsed.mnemonic }, derivationPath: parsed.derivationPath, address: parsed.address };
}

async function loadSecret(secretId: string, prompt: string): Promise<WalletSecret> {
  if (secretId === LEGACY_SECRET_ID) {
    const legacy = await readLegacySecret(prompt);
    if (!legacy) throw new Error("The protected wallet was not found. Restore it with your recovery phrase.");
    return legacy.secret;
  }
  const payload = await SecureStore.getItemAsync(`${SECRET_PREFIX}${secretId}`, authOptions(prompt));
  if (!payload) throw new Error("The protected wallet was not found. Restore it with your recovery phrase.");
  const parsed = JSON.parse(payload) as Partial<WalletSecret> & { mnemonic?: unknown; privateKey?: unknown };
  if (parsed.kind === "mnemonic" && typeof parsed.mnemonic === "string") return { kind: "mnemonic", mnemonic: parsed.mnemonic };
  if (parsed.kind === "privateKey" && typeof parsed.privateKey === "string") return { kind: "privateKey", privateKey: parsed.privateKey };
  throw new Error("The saved wallet data is invalid. Do not attempt to sign transactions.");
}

async function deleteSecret(secretId: string): Promise<void> {
  if (secretId === LEGACY_SECRET_ID) {
    await SecureStore.deleteItemAsync(LEGACY_VAULT_KEY, authOptions("Authenticate to remove this wallet"));
    return;
  }
  await SecureStore.deleteItemAsync(`${SECRET_PREFIX}${secretId}`, authOptions("Authenticate to remove this wallet"));
}

function signerFor(secret: WalletSecret, account: AccountMeta): BaseWallet {
  const signer = secret.kind === "mnemonic"
    ? HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(normalizePhrase(secret.mnemonic)), account.derivationPath ?? DEFAULT_PATH)
    : new Wallet(normalizePrivateKey(secret.privateKey));
  if (signer.address.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error("Wallet integrity check failed: the protected key does not match this account. Signing was stopped.");
  }
  return signer;
}

/**
 * Biometric-gated unlock of one account. Returns an in-memory signer that the
 * caller must drop as soon as the signature or transaction is done.
 */
export async function unlockAccount(accountId?: string, prompt = "Authenticate to use your TREX Wallet"): Promise<UnlockedAccount> {
  const registry = await loadRegistry();
  if (!registry) throw new Error("No wallet is stored on this device.");
  const account = accountId ? findAccount(registry, accountId) : activeAccount(registry);
  if (!account) throw new Error("Account not found.");
  if (account.secretId === LEGACY_SECRET_ID) {
    const legacy = await readLegacySecret(prompt);
    if (!legacy) throw new Error("The protected wallet was not found. Restore it with your recovery phrase.");
    // The registry migration assumed the default path; adopt the path saved with the original wallet.
    if (account.hdIndex === 0 && legacy.address.toLowerCase() === account.address.toLowerCase() && account.derivationPath !== legacy.derivationPath) {
      const fixed = { ...account, derivationPath: legacy.derivationPath };
      await writeRegistry({ ...registry, accounts: registry.accounts.map((item) => item.id === account.id ? fixed : item) });
      return { account: fixed, signer: signerFor(legacy.secret, fixed) };
    }
    return { account, signer: signerFor(legacy.secret, account) };
  }
  const secret = await loadSecret(account.secretId, prompt);
  return { account, signer: signerFor(secret, account) };
}

/** Saves a newly created or imported recovery phrase and its first account (index 0). */
export async function addMnemonicWallet(phrase: string, name?: string): Promise<AccountMeta> {
  const mnemonic = normalizePhrase(phrase);
  const derived = deriveHdAccount(mnemonic, 0);
  const registry = (await loadRegistry()) ?? { version: 2 as const, activeAccountId: null, secrets: [], accounts: [] };
  const secretId = newId();
  const next = addSecretWithAccount(registry, {
    secretId, accountId: newId(), kind: "mnemonic", address: derived.address, derivationPath: derived.derivationPath, name, now: new Date().toISOString()
  });
  await saveSecret(secretId, { kind: "mnemonic", mnemonic });
  await writeRegistry(next);
  return activeAccount(next) as AccountMeta;
}

/** Saves an imported private key as its own single-account wallet. */
export async function addPrivateKeyWallet(privateKey: string, name?: string): Promise<AccountMeta> {
  const key = normalizePrivateKey(privateKey);
  const address = new Wallet(key).address;
  const registry = (await loadRegistry()) ?? { version: 2 as const, activeAccountId: null, secrets: [], accounts: [] };
  const secretId = newId();
  const next = addSecretWithAccount(registry, {
    secretId, accountId: newId(), kind: "privateKey", address, derivationPath: null, name, now: new Date().toISOString()
  });
  await saveSecret(secretId, { kind: "privateKey", privateKey: key });
  await writeRegistry(next);
  return activeAccount(next) as AccountMeta;
}

/** Derives the next m/44'/60'/0'/0/i account from a stored phrase (biometric prompt). */
export async function addDerivedAccount(secretId: string, name?: string): Promise<AccountMeta> {
  const registry = await loadRegistry();
  if (!registry) throw new Error("No wallet is stored on this device.");
  const secret = await loadSecret(secretId, "Authenticate to add an account");
  if (secret.kind !== "mnemonic") throw new Error("Only recovery phrases can derive more accounts.");
  const index = nextHdIndex(registry, secretId);
  const derived = deriveHdAccount(secret.mnemonic, index);
  const next = addHdAccount(registry, { secretId, accountId: newId(), address: derived.address, hdIndex: index, name, now: new Date().toISOString() });
  await writeRegistry(next);
  return activeAccount(next) as AccountMeta;
}

export async function renameAccount(accountId: string, name: string): Promise<AccountRegistry> {
  const registry = await loadRegistry();
  if (!registry) throw new Error("No wallet is stored on this device.");
  return writeRegistry(renameAccountInRegistry(registry, accountId, name));
}

export async function setActiveAccount(accountId: string): Promise<AccountRegistry> {
  const registry = await loadRegistry();
  if (!registry) throw new Error("No wallet is stored on this device.");
  return writeRegistry(setActiveAccountInRegistry(registry, accountId));
}

/**
 * Removes an account. When it is the last account for a phrase or key, the
 * protected secret is deleted too (biometric prompt). Make sure the user has
 * a backup before calling this.
 */
export async function removeAccount(accountId: string): Promise<AccountRegistry> {
  const registry = await loadRegistry();
  if (!registry) throw new Error("No wallet is stored on this device.");
  const result = removeAccountFromRegistry(registry, accountId);
  if (result.orphanedSecretId) await deleteSecret(result.orphanedSecretId);
  return writeRegistry(result.registry);
}

/** Reveals the recovery phrase or key behind an account for backup (biometric prompt). */
export async function revealSecret(accountId: string): Promise<WalletSecret> {
  const registry = await loadRegistry();
  const account = registry ? findAccount(registry, accountId) : undefined;
  if (!account) throw new Error("Account not found.");
  return loadSecret(account.secretId, "Authenticate to reveal wallet backup");
}

/** True when this phrase's first account already exists (used to avoid duplicate imports). */
export async function hasAddress(address: string): Promise<boolean> {
  const registry = await loadRegistry();
  return !!registry?.accounts.some((account) => account.address.toLowerCase() === address.toLowerCase());
}

/**
 * Restore flow: when the phrase's first account already exists (for example
 * after Android invalidated the biometric key), store the phrase again and
 * point every account of that wallet at the fresh copy. Otherwise add it.
 */
export async function restoreMnemonicWallet(phrase: string): Promise<AccountMeta> {
  const mnemonic = normalizePhrase(phrase);
  const first = deriveHdAccount(mnemonic, 0);
  const registry = await loadRegistry();
  const existing = registry?.accounts.find((account) => account.address.toLowerCase() === first.address.toLowerCase());
  if (!registry || !existing) return addMnemonicWallet(mnemonic);
  const secretId = newId();
  await saveSecret(secretId, { kind: "mnemonic", mnemonic });
  const oldId = existing.secretId;
  const next: AccountRegistry = {
    ...registry,
    activeAccountId: existing.id,
    secrets: registry.secrets.map((secret) => secret.id === oldId ? { ...secret, id: secretId } : secret),
    accounts: registry.accounts.map((account) => account.secretId === oldId
      ? { ...account, secretId, derivationPath: account.derivationPath ?? DEFAULT_PATH }
      : account)
  };
  await writeRegistry(next);
  // Best effort: the previous copy may be unreadable, which is why the user is restoring.
  deleteSecret(oldId).catch(() => undefined);
  return { ...existing, secretId };
}
