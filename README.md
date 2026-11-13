# TREX Wallet

A personal, non-custodial EVM wallet for Android, designed around transaction clarity and security.

> **Development status:** Early scaffold. This repository is not a production wallet. Do not use it to store or transact real funds.

## Product principles

- Keys stay on the device. Never send recovery phrases or private keys to an API, analytics service, or AI assistant.
- Every transaction and signature must be explicitly reviewed and approved by the user.
- Security checks explain what they can and cannot verify; no interface may promise that a transaction is guaranteed safe.
- Start with test networks and controlled test funds. Mainnet use requires thorough testing and independent security review.

## Planned networks

Ethereum, Base, BNB Smart Chain, Arbitrum One, Optimism, and Polygon.

## Development

This project uses Expo / React Native with TypeScript. Use a development build for native wallet functionality; Expo Go is not a substitute for validating secure storage or signing flows.

```bash
npm install
npx expo start
```

For an Android development build, configure EAS or a local Android toolchain and build the native app. Never commit signing keys, RPC credentials, seed phrases, or private keys.

## Security roadmap

1. Wallet generation/import and verified recovery flow.
2. Android Keystore-backed encrypted local vault and biometric/PIN gating.
3. Read-only balances and transaction history.
4. Locally signed native-token and ERC-20 transfers.
5. Transaction decoding, approval warnings, simulation, and risk explanations.
6. Independent security review before any real-funds release.

See [SECURITY.md](SECURITY.md) and [ROADMAP.md](ROADMAP.md).
