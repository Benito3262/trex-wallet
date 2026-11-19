import { HDNodeWallet, Mnemonic, Wallet, getAddress } from "ethers";

/**
 * Pure account-registry logic. Nothing in this file touches storage or
 * secrets at rest; recovery phrases and private keys passed to the derive
 * helpers are only used in memory and must never be logged by callers.
 */

export type SecretKind = "mnemonic" | "privateKey";

export type WalletSecret =
  | { kind: "mnemonic"; mnemonic: string }
  | { kind: "privateKey"; privateKey: string };

/** Public metadata about one protected secret (phrase or key). */
export type SecretMeta = {
  id: string;
  kind: SecretKind;
  label: string;
  createdAt: string;
};

/** Public metadata about one account. Safe to keep outside the biometric vault. */
export type AccountMeta = {
  id: string;
  name: string;
  address: string;
  secretId: string;
  kind: SecretKind;
  derivationPath: string | null;
  hdIndex: number | null;
  createdAt: string;
};

export type AccountRegistry = {
  version: 2;
  activeAccountId: string | null;
  secrets: SecretMeta[];
  accounts: AccountMeta[];
};

export const LEGACY_SECRET_ID = "legacy";
export const MAX_ACCOUNT_NAME = 32;

export function hdPath(index: number): string {
  if (!Number.isSafeInteger(index) || index < 0 || index >= 0x80000000) {
    throw new Error("Account index must be a non-negative integer below 2^31.");
  }
  return `m/44'/60'/0'/0/${index}`;
}

/** Returns the address index for paths of the form m/44'/60'/0'/0/i, otherwise null. */
export function hdIndexFromPath(path: string): number | null {
  const match = /^m\/44'\/60'\/0'\/0\/(\d+)$/.exec(path);
  return match ? Number(match[1]) : null;
}

export function normalizePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().replace(/\s+/g, " ");
}

export function deriveHdAccount(phrase: string, index: number): { address: string; derivationPath: string; hdIndex: number } {
  const derivationPath = hdPath(index);
  const wallet = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(normalizePhrase(phrase)), derivationPath);
  return { address: wallet.address, derivationPath, hdIndex: index };
}

export function normalizePrivateKey(value: string): string {
  const trimmed = value.trim();
  const hex = trimmed.startsWith("0x") || trimmed.startsWith("0X") ? trimmed.slice(2) : trimmed;
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("A private key must be 64 hexadecimal characters.");
  return `0x${hex.toLowerCase()}`;
}

export function addressFromPrivateKey(privateKey: string): string {
  return new Wallet(normalizePrivateKey(privateKey)).address;
}

export function emptyRegistry(): AccountRegistry {
  return { version: 2, activeAccountId: null, secrets: [], accounts: [] };
}

export function validateAccountName(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error("Enter an account name.");
  if (trimmed.length > MAX_ACCOUNT_NAME) throw new Error(`Account names can be up to ${MAX_ACCOUNT_NAME} characters.`);
  return trimmed;
}

export function defaultAccountName(registry: AccountRegistry): string {
  const used = new Set(registry.accounts.map((account) => account.name));
  let n = registry.accounts.length + 1;
  while (used.has(`Account ${n}`)) n += 1;
  return `Account ${n}`;
}

export function findAccount(registry: AccountRegistry, id: string | null | undefined): AccountMeta | undefined {
  return id ? registry.accounts.find((account) => account.id === id) : undefined;
}

export function activeAccount(registry: AccountRegistry): AccountMeta | undefined {
  return findAccount(registry, registry.activeAccountId) ?? registry.accounts[0];
}

function assertNewAddress(registry: AccountRegistry, address: string) {
  const lower = address.toLowerCase();
  if (registry.accounts.some((account) => account.address.toLowerCase() === lower)) {
    throw new Error("This account is already in TREX Wallet.");
  }
}

export type NewSecretInput = {
  secretId: string;
  accountId: string;
  kind: SecretKind;
  address: string;
  derivationPath: string | null;
  name?: string;
  now: string;
};

/** Adds a newly created or imported phrase/key with its first account and makes it active. */
export function addSecretWithAccount(registry: AccountRegistry, input: NewSecretInput): AccountRegistry {
  if (registry.secrets.some((secret) => secret.id === input.secretId)) throw new Error("Duplicate wallet identifier.");
  const address = getAddress(input.address);
  assertNewAddress(registry, address);
  const walletNumber = registry.secrets.length + 1;
  const secret: SecretMeta = {
    id: input.secretId,
    kind: input.kind,
    label: input.kind === "mnemonic" ? `Recovery phrase ${walletNumber}` : `Imported key ${walletNumber}`,
    createdAt: input.now
  };
  const account: AccountMeta = {
    id: input.accountId,
    name: input.name ? validateAccountName(input.name) : defaultAccountName(registry),
    address,
    secretId: input.secretId,
    kind: input.kind,
    derivationPath: input.derivationPath,
    hdIndex: input.derivationPath ? hdIndexFromPath(input.derivationPath) : null,
    createdAt: input.now
  };
  return {
    ...registry,
    activeAccountId: account.id,
    secrets: [...registry.secrets, secret],
    accounts: [...registry.accounts, account]
  };
}

/** Next unused m/44'/60'/0'/0/i index for a phrase. */
export function nextHdIndex(registry: AccountRegistry, secretId: string): number {
  const used = registry.accounts
    .filter((account) => account.secretId === secretId && account.hdIndex !== null)
    .map((account) => account.hdIndex as number);
  let index = 0;
  const set = new Set(used);
  while (set.has(index)) index += 1;
  return index;
}

export function addHdAccount(
  registry: AccountRegistry,
  input: { secretId: string; accountId: string; address: string; hdIndex: number; name?: string; now: string }
): AccountRegistry {
  const secret = registry.secrets.find((item) => item.id === input.secretId);
  if (!secret) throw new Error("That recovery phrase is not stored in TREX Wallet.");
  if (secret.kind !== "mnemonic") throw new Error("Only recovery phrases can derive more accounts.");
  if (registry.accounts.some((account) => account.secretId === input.secretId && account.hdIndex === input.hdIndex)) {
    throw new Error("That account index already exists.");
  }
  const address = getAddress(input.address);
  assertNewAddress(registry, address);
  const account: AccountMeta = {
    id: input.accountId,
    name: input.name ? validateAccountName(input.name) : defaultAccountName(registry),
    address,
    secretId: input.secretId,
    kind: "mnemonic",
    derivationPath: hdPath(input.hdIndex),
    hdIndex: input.hdIndex,
    createdAt: input.now
  };
  return { ...registry, activeAccountId: account.id, accounts: [...registry.accounts, account] };
}

export function renameAccount(registry: AccountRegistry, accountId: string, name: string): AccountRegistry {
  const validName = validateAccountName(name);
  if (!findAccount(registry, accountId)) throw new Error("Account not found.");
  return {
    ...registry,
    accounts: registry.accounts.map((account) => account.id === accountId ? { ...account, name: validName } : account)
  };
}

export function setActiveAccount(registry: AccountRegistry, accountId: string): AccountRegistry {
  if (!findAccount(registry, accountId)) throw new Error("Account not found.");
  return { ...registry, activeAccountId: accountId };
}

/**
 * Removes one account. When it was the last account using a phrase or key,
 * the secret id is returned so the caller can delete it from secure storage.
 */
export function removeAccount(
  registry: AccountRegistry,
  accountId: string
): { registry: AccountRegistry; orphanedSecretId: string | null } {
  const target = findAccount(registry, accountId);
  if (!target) throw new Error("Account not found.");
  const accounts = registry.accounts.filter((account) => account.id !== accountId);
  const stillUsed = accounts.some((account) => account.secretId === target.secretId);
  const secrets = stillUsed ? registry.secrets : registry.secrets.filter((secret) => secret.id !== target.secretId);
  const activeAccountId = registry.activeAccountId === accountId ? accounts[0]?.id ?? null : registry.activeAccountId;
  return {
    registry: { ...registry, accounts, secrets, activeAccountId },
    orphanedSecretId: stillUsed ? null : target.secretId
  };
}

/** Builds a registry for an install that only has the original single-wallet vault entry. */
export function migrateLegacyWallet(address: string, derivationPath: string, now: string, accountId = "legacy-0"): AccountRegistry {
  return addSecretWithAccount(emptyRegistry(), {
    secretId: LEGACY_SECRET_ID,
    accountId,
    kind: "mnemonic",
    address,
    derivationPath,
    name: "Main account",
    now
  });
}

/** Parses stored registry JSON. Returns null when it is missing or malformed. */
export function parseRegistry(json: string | null): AccountRegistry | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<AccountRegistry>;
    if (value?.version !== 2 || !Array.isArray(value.accounts) || !Array.isArray(value.secrets)) return null;
    const accounts = value.accounts.filter((account): account is AccountMeta =>
      typeof account?.id === "string" &&
      typeof account.name === "string" &&
      typeof account.address === "string" &&
      typeof account.secretId === "string" &&
      (account.kind === "mnemonic" || account.kind === "privateKey")
    );
    const secrets = value.secrets.filter((secret): secret is SecretMeta =>
      typeof secret?.id === "string" && (secret.kind === "mnemonic" || secret.kind === "privateKey")
    );
    const activeAccountId = typeof value.activeAccountId === "string" && accounts.some((a) => a.id === value.activeAccountId)
      ? value.activeAccountId
      : accounts[0]?.id ?? null;
    return { version: 2, activeAccountId, secrets, accounts };
  } catch {
    return null;
  }
}
