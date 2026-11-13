# TREX Wallet roadmap

## Phase 0 — Foundation
- [x] Create repository and product/security baseline
- [x] Add Android Expo / React Native TypeScript scaffold
- [ ] Verify dependency compatibility and Android build
- [ ] Add CI typecheck and tests

## Phase 1 — Wallet lifecycle
- [ ] Secure random entropy and BIP-39 phrase generation
- [ ] Import and restore with validation
- [ ] Recovery phrase confirmation flow
- [ ] Android Keystore-backed encrypted vault
- [ ] Biometric and fallback PIN gate
- [ ] Multiple account derivation and account labels

## Phase 2 — Read-only wallet
- [ ] Network switching and RPC configuration
- [ ] Native and ERC-20 balances
- [ ] Receive address and QR code
- [ ] Transaction history and explorer links

## Phase 3 — Controlled signing
- [ ] Transaction construction and gas estimation
- [ ] Local native-token and ERC-20 signing
- [ ] Explicit review and confirmation screens
- [ ] Chain and recipient validation

## Phase 4 — TREX security intelligence
- [ ] Calldata and typed-data decoding
- [ ] Unlimited approval and Permit warnings
- [ ] Address and token risk signals
- [ ] Transaction simulation with clear limitations
- [ ] Human-readable risk explanations

## Phase 5 — Release readiness
- [ ] Automated unit and device tests
- [ ] Independent security assessment
- [ ] Signed Android release build
- [ ] Recovery and incident-response documentation

WalletConnect, swaps, bridging, and AI assistance are later features. Any AI assistant remains read-only and must never receive keys or signing authority.
