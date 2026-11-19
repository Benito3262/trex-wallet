# TREX Wallet

[![CI](https://github.com/Benito3262/trex-wallet/actions/workflows/ci.yml/badge.svg)](https://github.com/Benito3262/trex-wallet/actions/workflows/ci.yml) [![Android APK](https://github.com/Benito3262/trex-wallet/actions/workflows/android-apk.yml/badge.svg)](https://github.com/Benito3262/trex-wallet/actions/workflows/android-apk.yml)

TREX Wallet is a personal, non-custodial EVM wallet for Android. Its design priority is transaction clarity, local key protection, and security warnings before signing.

> **Status: early test build.** The app is under active development and has not had an independent security audit. Use test networks and test funds only. Do not store meaningful assets in this build.

## Implemented in this repository

- Android app on Expo SDK 58, React Native 0.88 and TypeScript, with the TREX espresso/amber branding (official logo for the icon, adaptive icon, splash, onboarding, unlock and header).
- **Multiple wallets:** create or restore a recovery phrase, import a private key, derive more HD accounts (`m/44'/60'/0'/0/i`), switch, rename and remove accounts (with confirmation). Every secret sits in its own biometric-gated SecureStore entry. Single-wallet installs from earlier builds are migrated in place; the old secret is never rewritten.
- **In-app dApp browser:** an injected EIP-1193 provider that announces itself through EIP-6963. It supports `eth_requestAccounts`, `eth_accounts`, `eth_chainId`, `wallet_switchEthereumChain`, `personal_sign`, `eth_signTypedData_v4` and `eth_sendTransaction`, and emits `accountsChanged`/`chainChanged`. Sites must ask before they connect, and only HTTPS (or localhost) origins can reach the wallet. A Connected sites screen lets you disconnect them. `eth_sign` and other raw signing methods are refused.
- **WalletConnect v2** through Reown WalletKit: scan the dApp's QR, paste a `wc:` link or open a `trexwallet://wc?uri=` deep link, approve the session, then manage or disconnect sessions. Reviews close themselves (with a notice) when a request expires, its lifetime runs out (default 5 minutes) or the session is disconnected or expires, and TREX re-checks that the request is still live after biometrics, before signing.
- **QR scanning** (expo-camera, QR codes only, no microphone): recipient addresses (plain or EIP-681 `ethereum:` links, checksum-validated, with chain/token mismatch warnings), token contracts and WalletConnect codes. If camera access is denied, the scanner explains and offers Android settings; pasting still works.
- **Review sheets for every request.** Each signature or transaction opens a review and needs biometrics, so a page can never sign without you. Reviews include:
  - an `eth_call` simulation, a gas estimate and a balance-plus-fee check;
  - contract vs. EOA detection and first-interaction detection;
  - chain-mismatch blocking;
  - decoding of unlimited ERC-20 approvals, `setApprovalForAll`, EIP-2612/DAI Permit and Permit2 (spender, amount, expiry), plus SIWE domain checks.
- **Self-cleaning approvals:** an unlimited approval can be swapped for an exact amount before you sign. An Open approvals screen reads live allowances for approvals made through TREX and revokes them with one tap, through the same review.
- Native and ERC-20 transfers on testnets with a slide-up review sheet, receive QR, and local SQLite history that holds public metadata only.
- Jest tests for HD derivation and account storage logic, migration, provider routing, the injected script, approval rewriting, Permit/Permit2 decoding, review rules and WalletConnect URIs and namespaces.

## Networks

Mainnets: Ethereum, Base, BNB Smart Chain, Arbitrum One, Optimism and Polygon. **Mainnet signing is disabled.** You can read balances on a mainnet and connect dApps there, but every mainnet transaction, typed-data or message signature is blocked with an explanation.

Testnets where signing is enabled: Ethereum Sepolia, Base Sepolia and Robinhood Chain testnet (chain ID 46630, RPC `https://rpc.testnet.chain.robinhood.com`). New installs default to Base Sepolia.

Public RPC endpoints are configured in the source as fallbacks. You can override them with the variables in `.env.example`. RPC providers can see your public address and network requests. Values prefixed with `EXPO_PUBLIC_` are bundled into the app, so never put private API credentials, seed phrases or private keys in them.

## WalletConnect project ID

WalletConnect reads the public Reown project ID from `EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID`. The APK workflow uses the repository variable of that name when it is set, and otherwise falls back to the project's public ID. Local builds without the variable still run: the WalletConnect screen says a project ID is needed.

## Run locally

Use Node.js 22.13 or newer and the Android toolchain required by React Native.

```bash
npm install
npx expo install --check
npm run typecheck
npm test -- --runInBand
npx expo start
```

To generate the native Android project and run on a connected device:

```bash
npx expo prebuild --platform android
npx expo run:android
```

## Build an installable debug APK

Every qualifying push to `main` triggers the GitHub Actions workflow **TREX Wallet Android APK**. When it succeeds, open the repository's Actions tab, open the completed run, and download the `trex-wallet-debug-apk` artifact. This is a debug-signed test APK, not a production release.

## Security boundaries and honest limitations

- This is an **early test build**. It is not audited and not finished. Use testnet funds only.
- Recovery phrases and private keys never leave the device. Never send them to an API, issue tracker or AI assistant.
- Simulation and risk checks are **best-effort**:
  - They depend on public RPC responses, which can be wrong or unavailable.
  - They do not decode every contract.
  - They cannot prove that a site or recipient is honest.
  - "Simulation unavailable" means the check did not run. It does not mean the request is safe.
- Open approvals only lists approvals made through TREX. It is not a full on-chain allowance scan.
- The app has **not been tested on a physical device yet**. CI checks types, unit tests and that the APK builds, but the WebView provider, WalletConnect pairing, biometrics and migration need hands-on testing.
- WalletConnect one-click auth (`session_authenticate`) is rejected, so dApps fall back to a normal session. Swaps and bridging are not implemented.
- The camera permission dialog briefly backgrounds the app on Android. TREX gives TREX-opened permission dialogs and the settings screen a one-shot 30-second grace before locking; any other trip out of the app locks immediately.

See [SECURITY.md](SECURITY.md) and [ROADMAP.md](ROADMAP.md).
