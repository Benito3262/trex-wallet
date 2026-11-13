# Security model and release gates

TREX Wallet is an early-stage, non-custodial Android wallet. The current test build can create/import an EVM wallet, store its recovery phrase in authenticated device secure storage, read native balances, receive assets, and submit native-asset transfers. It has not been independently audited and must not be used to store meaningful assets.

## Implemented protections

- Recovery phrase data is stored through Expo SecureStore, backed by Android Keystore encryption.
- Access to the recovery phrase requires enrolled device biometrics.
- Recovery phrase onboarding blocks screenshots and screen recording while the phrase is displayed.
- Native transfers are signed locally; the mnemonic is not sent to RPC providers.
- The transaction review checks recipient address syntax, expected chain ID, current balance, and estimated gas before signing.
- Transaction history stores public transaction metadata only, never secret material.
- New installs default to Base Sepolia testnet.
- Manual ERC-20 token transfers are limited to Sepolia testnets and re-check contract code, symbol, decimals, token balance, native gas balance, and chain ID before local signing.

## Non-negotiable rules

- Never log, transmit, paste into issues, or commit a mnemonic, private key, keystore password, or decrypted vault data.
- Do not place secrets in AsyncStorage, SQLite, app logs, crash reports, analytics, clipboard auto-copy, or source control.
- Use Android Keystore-backed encryption for the local vault. Decrypt only for the shortest possible signing operation and clear references promptly where practical. JavaScript strings cannot be reliably zeroized; minimize their lifetime.
- Require explicit user confirmation for every transaction, typed-data signature, and message signature.
- Display chain, destination, decoded method, token, amount, spender, and approval scope before signing whenever data is available.
- Treat RPC responses, token metadata, simulation results, and security feeds as untrusted inputs.
- Never describe a scan as a guarantee. Show unavailable checks and uncertainty.
- Do not implement automatic signing or allow an AI component to approve or sign.

## Known limitations

- Biometric enrollment is required. A recovery phrase remains essential if the device is lost, damaged, or biometric keys are invalidated.
- Public RPC providers can observe the wallet address and network activity.
- The current send flow supports native assets only. It does not decode arbitrary contract calls or ERC-20 approvals.
- Native transfer preflight is not a scam detector. It cannot prove that a recipient belongs to the intended person.
- A transaction marked submitted is not necessarily confirmed or successful.
- The app does not yet implement WalletConnect, arbitrary contract interactions, swaps, bridging, or a production-grade security intelligence engine.

## Required security work before real funds

1. Threat model and key lifecycle review.
2. Recovery phrase generation, display, confirmation, import, and restore tests on physical Android devices.
3. Secure storage review on supported Android versions, biometric enrollment changes, rooted-device limitations, backup/restore, and app reinstall behavior.
4. Transaction serialization and signature test vectors for every supported chain.
5. Chain-ID, RPC substitution, replay-protection, and malicious RPC response tests.
6. ERC-20 approval and Permit / Permit2 decoding tests before those features are enabled.
7. Malicious calldata, address poisoning, and RPC failure tests.
8. Independent review of cryptographic and native code.

The current APK is for development and controlled testnet use only. Do not use real funds until all release gates are completed and independently reviewed.
