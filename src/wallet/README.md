# Wallet identity module

`identity.ts` generates an EVM mnemonic and derives an address using the standard BIP-44 EVM path.

Important:
- The returned mnemonic is highly sensitive. The caller must show it only during onboarding and require recovery confirmation.
- This module does not save the mnemonic. Vault encryption and secure persistence are a separate required step.
- Do not connect wallet creation to analytics, logging, network requests, clipboard auto-copy, or AI.
- Verify derivation against independent BIP-39/BIP-44 test vectors before release.
- Never use this early implementation with real funds until the secure vault, recovery UX, and security review are complete.
