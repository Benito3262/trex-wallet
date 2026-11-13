import {
  HDNodeWallet,
  JsonRpcProvider,
  Mnemonic,
  formatEther,
  parseEther,
  isAddress,
  type FeeData
} from "ethers";
import type { EvmNetwork } from "../config/networks";
import type { StoredWallet } from "./vault";

const TESTNET_SEND_CHAINS = new Set([11155111, 84532]);

function assertTestnetSendingEnabled(network: EvmNetwork) {
  if (!TESTNET_SEND_CHAINS.has(network.chainId)) {
    throw new Error("Mainnet transfers are disabled in this development build. Switch to Ethereum Sepolia or Base Sepolia.");
  }
}

const RPC: Record<number, string> = {
  1: "https://cloudflare-eth.com",
  8453: "https://mainnet.base.org",
  56: "https://bsc-dataseed.binance.org",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
  137: "https://polygon-rpc.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  84532: "https://sepolia.base.org"
};

const RPC_OVERRIDE: Record<number, string | undefined> = {
  1: process.env.EXPO_PUBLIC_ETHEREUM_RPC_URL,
  8453: process.env.EXPO_PUBLIC_BASE_RPC_URL,
  56: process.env.EXPO_PUBLIC_BNB_RPC_URL,
  42161: process.env.EXPO_PUBLIC_ARBITRUM_RPC_URL,
  10: process.env.EXPO_PUBLIC_OPTIMISM_RPC_URL,
  137: process.env.EXPO_PUBLIC_POLYGON_RPC_URL,
  11155111: process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL,
  84532: process.env.EXPO_PUBLIC_BASE_SEPOLIA_RPC_URL
};

export type NativeTransferPreview = {
  chainId: number;
  to: string;
  amount: string;
  symbol: string;
  gasLimit: string;
  maxFeePerGas: string;
  estimatedNetworkFee: string;
  totalMaximum: string;
  balance: string;
};

function providerFor(network: EvmNetwork) {
  const url = RPC_OVERRIDE[network.chainId] || RPC[network.chainId];
  if (!url) throw new Error("No RPC endpoint is configured for this network.");
  return new JsonRpcProvider(url, network.chainId, { staticNetwork: true });
}

async function assertExpectedChain(provider: JsonRpcProvider, network: EvmNetwork) {
  const chainHex = await provider.send("eth_chainId", []);
  const actual = Number(BigInt(chainHex));
  if (actual !== network.chainId) {
    throw new Error(`RPC chain mismatch. Expected ${network.chainId}, received ${actual}.`);
  }
}

function parseAmount(amount: string) {
  if (!/^\d+(\.\d{1,18})?$/.test(amount.trim())) {
    throw new Error("Enter a valid amount with up to 18 decimal places.");
  }
  const value = parseEther(amount.trim());
  if (value <= 0n) throw new Error("Amount must be greater than zero.");
  return value;
}

type FeeQuote =
  | { kind: "eip1559"; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; cap: bigint }
  | { kind: "legacy"; gasPrice: bigint; cap: bigint };

function selectFee(feeData: FeeData): FeeQuote {
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    return {
      kind: "eip1559",
      maxFeePerGas: feeData.maxFeePerGas,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
      cap: feeData.maxFeePerGas
    };
  }
  if (feeData.gasPrice) {
    return { kind: "legacy", gasPrice: feeData.gasPrice, cap: feeData.gasPrice };
  }
  throw new Error("The network did not return usable gas fee data.");
}

export async function prepareNativeTransfer(
  network: EvmNetwork,
  from: string,
  recipient: string,
  amount: string
): Promise<NativeTransferPreview> {
  assertTestnetSendingEnabled(network);
  if (!isAddress(recipient)) throw new Error("Recipient address is not valid.");
  const to = recipient.trim();
  const value = parseAmount(amount);
  const provider = providerFor(network);
  try {
    await assertExpectedChain(provider, network);
    const [balance, gasLimit, feeData] = await Promise.all([
      provider.getBalance(from),
      provider.estimateGas({ from, to, value }),
      provider.getFeeData()
    ]);
    const fee = selectFee(feeData);
    const estimatedFee = gasLimit * fee.cap;
    if (balance < value + estimatedFee) {
      throw new Error("Insufficient balance for the amount and maximum estimated network fee.");
    }
    return {
      chainId: network.chainId,
      to,
      amount: amount.trim(),
      symbol: network.symbol,
      gasLimit: gasLimit.toString(),
      maxFeePerGas: formatEther(fee.cap),
      estimatedNetworkFee: formatEther(estimatedFee),
      totalMaximum: formatEther(value + estimatedFee),
      balance: formatEther(balance)
    };
  } finally {
    provider.destroy();
  }
}

/**
 * Local native-asset transfer. The mnemonic is loaded from the authenticated
 * device vault by the caller and is never sent to the RPC provider.
 */
export async function sendNativeTransfer(
  network: EvmNetwork,
  storedWallet: StoredWallet,
  recipient: string,
  amount: string
): Promise<string> {
  assertTestnetSendingEnabled(network);
  if (!isAddress(recipient)) throw new Error("Recipient address is not valid.");
  const value = parseAmount(amount);
  const provider = providerFor(network);
  try {
    await assertExpectedChain(provider, network);
    const mnemonic = Mnemonic.fromPhrase(storedWallet.mnemonic);
    const signer = HDNodeWallet.fromMnemonic(mnemonic, storedWallet.derivationPath).connect(provider);
    if (signer.address.toLowerCase() !== storedWallet.address.toLowerCase()) {
      throw new Error("The protected wallet does not match its saved public address.");
    }

    const [gasLimit, feeData, balance] = await Promise.all([
      provider.estimateGas({ from: signer.address, to: recipient, value }),
      provider.getFeeData(),
      provider.getBalance(signer.address)
    ]);
    const fee = selectFee(feeData);
    const maxFee = gasLimit * fee.cap;
    if (balance < value + maxFee) {
      throw new Error("Insufficient balance after the latest network fee estimate.");
    }

    const request = {
      to: recipient.trim(),
      value,
      gasLimit,
      chainId: network.chainId,
      ...(fee.kind === "eip1559"
        ? { maxFeePerGas: fee.maxFeePerGas, maxPriorityFeePerGas: fee.maxPriorityFeePerGas }
        : { gasPrice: fee.gasPrice })
    };
    const response = await signer.sendTransaction(request);
    return response.hash;
  } finally {
    provider.destroy();
  }
}
