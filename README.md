# TREX Wallet

TREX Wallet is a personal, non-custodial EVM wallet for Android. Its design priority is transaction clarity, local key protection, and security warnings before signing.

> **Status: early test build.** The app is under active development and has not had an independent security audit. Use test networks and test funds only. Do not store meaningful assets in this build.

## Implemented in this repository

- Android app foundation using Expo SDK 58, React Native, and TypeScript.
- Wallet creation and 12-word recovery phrase display.
- Recovery-word confirmation before saving a newly generated wallet.
- Recovery phrase import and EVM address derivation using the BIP-44 path.
- Authenticated local storage through Expo SecureStore, with biometric enrollment required.
- Screenshot and screen-recording protection during wallet onboarding.
- Read-only native balance lookup on supported networks.
- Receive address QR code and copy action.
- Native-asset transfer review, gas estimation, chain-ID check, biometric unlock, and local signing.
- Local SQLite transaction history containing public transaction metadata only.
- Unit tests for address derivation and invalid phrase handling.

## Networks

Mainnets: Ethereum, Base, BNB Smart Chain, Arbitrum One, Optimism, and Polygon.

Testnets: Ethereum Sepolia and Base Sepolia. **New installs default to Base Sepolia** to reduce the risk of accidental mainnet spending while testing. Native transfers are currently restricted in code to Ethereum Sepolia and Base Sepolia; mainnet send actions are disabled.

Public RPC endpoints are configured in the source as fallbacks. You can override them with the variables in `.env.example`. RPC providers can observe the public wallet address and network requests. Values prefixed with `EXPO_PUBLIC_` are bundled into the app; never put private API credentials, seed phrases, or private keys in them.

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

## Security boundaries

- Recovery phrases and private keys must never be sent to an API, analytics service, issue, or AI assistant.
- Never commit signing keys, seed phrases, private keys, or secrets.
- A biometric prompt is an access gate, not a substitute for secure vault encryption.
- Native transfer preflight checks address format, chain ID, balance, and a gas estimate. It does not verify recipient ownership or detect every scam.
- A submitted transaction is not necessarily confirmed.
- The current app does not yet support ERC-20 transfers, token approvals, arbitrary contract calls, WalletConnect, swaps, or bridging.
- Mainnet use requires thorough device testing, recovery testing, transaction test vectors, and independent security review.

See [SECURITY.md](SECURITY.md) and [ROADMAP.md](ROADMAP.md).
