import "react-native-get-random-values";
import { HDNodeWallet, Mnemonic } from "ethers";

export const EVM_DERIVATION_PATH = "m/44'/60'/0'/0/0";

export type WalletIdentity = {
  address: string;
  derivationPath: string;
};

/**
 * Generates a fresh EVM identity using ethers' cryptographically secure
 * random source. The mnemonic is returned once to the caller and must only
 * be displayed in a recovery-confirmation flow. Never log or persist it here.
 */
export function createWalletIdentity(): WalletIdentity & { mnemonic: string } {
  const wallet = HDNodeWallet.createRandom();
  if (!wallet.mnemonic?.phrase) {
    throw new Error("Secure wallet entropy could not be generated on this device.");
  }

  return {
    address: wallet.address,
    mnemonic: wallet.mnemonic.phrase,
    derivationPath: wallet.path ?? EVM_DERIVATION_PATH
  };
}

/**
 * Derives one EVM account from a user-supplied recovery phrase.
 * The caller is responsible for protecting the phrase and never sending it
 * to logs, analytics, remote services, or AI features.
 */
export function deriveWalletFromPhrase(
  phrase: string,
  accountIndex = 0
): WalletIdentity {
  if (!Number.isSafeInteger(accountIndex) || accountIndex < 0) {
    throw new Error("Account index must be a non-negative safe integer.");
  }

  const normalizedPhrase = phrase.trim().replace(/\s+/g, " ");
  const mnemonic = Mnemonic.fromPhrase(normalizedPhrase);
  const derivationPath = `m/44'/60'/${accountIndex}'/0/0`;
  const wallet = HDNodeWallet.fromMnemonic(mnemonic, derivationPath);

  return {
    address: wallet.address,
    derivationPath
  };
}
