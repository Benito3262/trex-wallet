# Security model and release gates

TREX Wallet is intended to be a non-custodial wallet. This document records requirements, not a claim that the current scaffold implements them.

## Non-negotiable rules

- Never log, transmit, paste into issues, or commit a mnemonic, private key, keystore password, or decrypted vault data.
- Do not place secrets in AsyncStorage, SQLite, app logs, crash reports, analytics, clipboard, or source control.
- Use Android Keystore-backed encryption for the local vault. Decrypt only for the shortest possible signing operation and clear references promptly where practical.
- Require explicit user confirmation for every transaction, typed-data signature, and message signature.
- Display chain, destination, decoded method, token, amount, spender, and approval scope before signing whenever data is available.
- Treat RPC responses, token metadata, simulation results, and security feeds as untrusted inputs.
- Never describe a scan as a guarantee. Show unavailable checks and uncertainty.
- Do not implement automatic signing or allow an AI component to approve or sign.

## Required security work before real funds

1. Threat model and key lifecycle review.
2. Recovery phrase generation, display, confirmation, import, and restore tests.
3. Secure storage review on supported Android versions and rooted-device limitations.
4. Transaction serialization and signature test vectors.
5. Chain-ID and replay-protection tests.
6. ERC-20 approval and Permit / Permit2 decoding tests.
7. Malicious calldata, address poisoning, and RPC failure tests.
8. Independent review of cryptographic and native code.

## Current limitation

The initial repository scaffold is not a usable wallet and must not be used with real assets. A biometric prompt alone does not encrypt a secret; vault encryption and authentication must be designed and tested together.
