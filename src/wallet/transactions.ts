import {
  type JsonRpcProvider,
  type BaseWallet,
  formatEther,
  parseEther,
  isAddress,
  type FeeData
} from "ethers";
import { assertSigningAllowed, type EvmNetwork } from "../config/networks";
import { bestProvider } from "./rpcPool";

function assertTestnetSendingEnabled(network: EvmNetwork) {
  assertSigningAllowed(network.chainId);
}

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
  recipientIsContract: boolean;
};

function providerFor(network: EvmNetwork) {
  return bestProvider(network);
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
    const [balance, gasLimit, feeData, recipientCode] = await Promise.all([
      provider.getBalance(from),
      provider.estimateGas({ from, to, value }),
      provider.getFeeData(),
      provider.getCode(to)
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
      balance: formatEther(balance),
      recipientIsContract: recipientCode !== "0x"
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
  wallet: BaseWallet,
  recipient: string,
  amount: string
): Promise<string> {
  assertTestnetSendingEnabled(network);
  if (!isAddress(recipient)) throw new Error("Recipient address is not valid.");
  const value = parseAmount(amount);
  const provider = providerFor(network);
  try {
    await assertExpectedChain(provider, network);
    const signer = wallet.connect(provider);

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
