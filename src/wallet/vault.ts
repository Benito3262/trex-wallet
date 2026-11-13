import * as SecureStore from "expo-secure-store";
import { WalletIdentity } from "./identity";

const VAULT_KEY = "trex.wallet.v1";

export type StoredWallet = WalletIdentity & {
  mnemonic: string;
  createdAt: string;
};

/**
 * Store the recovery phrase in Android Keystore-backed SecureStore.
 * Authentication is required whenever the value is read or replaced.
 * The phrase is never written to AsyncStorage, files, logs, or a server.
 */
export async function saveWallet(wallet: StoredWallet): Promise<void> {
  const payload = JSON.stringify(wallet);
  await SecureStore.setItemAsync(VAULT_KEY, payload, {
    keychainService: "com.trexwallet.app.wallet",
    requireAuthentication: true,
    authenticationPrompt: "Unlock TREX Wallet to protect your recovery phrase"
  });
}

export async function loadWallet(): Promise<StoredWallet | null> {
  const payload = await SecureStore.getItemAsync(VAULT_KEY, {
    keychainService: "com.trexwallet.app.wallet",
    requireAuthentication: true,
    authenticationPrompt: "Authenticate to unlock your TREX Wallet"
  });
  if (!payload) return null;

  const parsed: unknown = JSON.parse(payload);
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("mnemonic" in parsed) ||
    typeof parsed.mnemonic !== "string" ||
    !("address" in parsed) ||
    typeof parsed.address !== "string" ||
    !("derivationPath" in parsed) ||
    typeof parsed.derivationPath !== "string"
  ) {
    throw new Error("The saved wallet data is invalid. Do not attempt to sign transactions.");
  }
  return parsed as StoredWallet;
}

export async function deleteWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(VAULT_KEY, {
    keychainService: "com.trexwallet.app.wallet",
    requireAuthentication: true,
    authenticationPrompt: "Authenticate to remove this wallet"
  });
}

export async function isWalletStored(): Promise<boolean> {
  return SecureStore.getItemAsync(VAULT_KEY, {
    keychainService: "com.trexwallet.app.wallet",
    requireAuthentication: false
  }).then((value) => value !== null);
}
