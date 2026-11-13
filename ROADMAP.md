# TREX Wallet roadmap

## Phase 0 — Foundation
- [x] Create repository and product/security baseline
- [x] Add Expo SDK 58 / React Native TypeScript Android app
- [x] Add CI typecheck and unit test workflow
- [x] Add Android debug APK build workflow

## Phase 1 — Wallet lifecycle
- [x] Generate EVM recovery phrase and first account
- [x] Import and validate recovery phrase
- [x] Recovery phrase word-confirmation flow
- [x] Android Keystore-backed SecureStore integration with biometric gating
- [x] Screenshot protection during recovery phrase display
- [ ] Add independent secure-vault review and device-specific testing
- [ ] Add multiple account derivation and account management
- [ ] Add explicit recovery/restore drill and documented lost-device procedure

## Phase 2 — Read-only wallet
- [x] Add supported mainnets and Sepolia testnets
- [x] Read native-asset balances from configured RPC providers
- [x] Receive address and QR code
- [x] Local transaction metadata history
- [ ] Add custom ERC-20 token discovery and balances
- [ ] Add on-chain transaction receipt and confirmation status refresh

## Phase 3 — Controlled signing
- [x] Native transfer construction and gas estimation
- [x] Chain-ID validation and balance-plus-fee preflight
- [x] Local native-asset signing with authenticated vault unlock
- [x] Explicit review and confirmation screen
- [ ] ERC-20 transfers and token decimals/amount validation
- [ ] Hardware-backed transaction-signing threat review
- [ ] Transaction simulation and recipient risk checks

## Phase 4 — TREX security intelligence
- [ ] Calldata and typed-data decoding
- [ ] Unlimited approval, Permit, and Permit2 warnings
- [ ] Address and token risk signals
- [ ] Transaction simulation with clear limitations
- [ ] Human-readable risk explanations

## Phase 5 — Release readiness
- [ ] Automated Android device tests
- [ ] BIP-39/BIP-44 and transaction signing test vectors
- [ ] Independent security assessment
- [ ] Signed Android production release
- [ ] Recovery and incident-response documentation

WalletConnect, swaps, bridging, and AI assistance are later features. Any AI assistant remains read-only and must never receive keys or signing authority.

**Release rule:** the current APK is a development/test build. Do not use it for meaningful funds. Mainnet signing must remain disabled in a release candidate until device testing, recovery testing, and independent security review are complete.
