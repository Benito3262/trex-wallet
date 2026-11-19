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
- [x] Multiple wallets: HD account derivation, private-key import, switch/rename/remove, legacy migration
- [ ] Add explicit recovery/restore drill and documented lost-device procedure

## Phase 2 — Read-only wallet
- [x] Add supported mainnets, Sepolia, Base Sepolia and Robinhood Chain testnet
- [x] Read native-asset balances from configured RPC providers
- [x] Multi-RPC fallback with timeouts and chain-ID checks; dead Ethereum/Polygon RPCs replaced
- [x] Mainnet token detection from a verified well-known token list over RPC
- [x] Motion overhaul: UI-thread press feedback + haptics, stack transitions with swipe-back, gesture bottom sheets, skeletons, pull-to-refresh, balance count-up
- [x] Receive address and QR code
- [x] Local transaction metadata history
- [x] Add manual ERC-20 contract inspection and custom token balances
- [x] Refresh submitted transaction status from on-chain receipts (included or failed)

## Phase 3 — Controlled signing
- [x] Native transfer construction and gas estimation
- [x] Chain-ID validation and balance-plus-fee preflight
- [x] Local native-asset signing with authenticated vault unlock
- [x] Explicit review and confirmation screen
- [x] ERC-20 testnet transfers with token metadata revalidation and native gas checks
- [ ] Hardware-backed transaction-signing threat review
- [x] eth_call simulation, gas/fee and balance checks, contract vs EOA and first-interaction flags
- [x] Mainnet signing blocked in code (read and connect only)

## Phase 4 — TREX security intelligence
- [x] Offline calldata decoding for common ERC-20 approvals, EIP-2612 permits and Permit2 approvals
- [x] Unlimited approval, setApprovalForAll, Permit and Permit2 warnings in every review sheet
- [x] Exact-amount approval rewrite and Open approvals screen with revoke
- [ ] Address and token risk signals
- [x] Best-effort transaction simulation with stated limitations
- [ ] Full on-chain allowance discovery (today only approvals made through TREX are tracked)
- [ ] Human-readable risk explanations

## Phase 5 — Release readiness
- [ ] Automated Android device tests
- [ ] BIP-39/BIP-44 and transaction signing test vectors
- [ ] Independent security assessment
- [ ] Signed Android production release
- [ ] Recovery and incident-response documentation

## Phase 3b — dApp connectivity (early, untested on device)
- [x] In-app browser with EIP-1193 provider and EIP-6963 announcement
- [x] Per-site connect approval, connected-sites list, accountsChanged/chainChanged
- [x] WalletConnect v2 (Reown WalletKit) pairing by pasted link or deep link
- [x] WalletConnect QR scanning (expo-camera)
- [x] Auto-close reviews on WalletConnect request expiry, timeout, disconnect and session expiry
- [x] QR scanning for recipient addresses (EIP-681) and token contracts
- [ ] On-device testing of browser and WalletConnect flows against real dApps

Swaps, bridging, and AI assistance are later features. Any AI assistant remains read-only and must never receive keys or signing authority.

**Release rule:** the current APK is a development/test build. Do not use it for meaningful funds. Mainnet signing must remain disabled in a release candidate until device testing, recovery testing, and independent security review are complete.
