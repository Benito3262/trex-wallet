import {
  Contract,
  HDNodeWallet,
  JsonRpcProvider,
  Mnemonic,
  formatEther,
  formatUnits,
  isAddress,
  parseUnits
} from "ethers";
import type { EvmNetwork } from "../config/networks";
import type { StoredWallet } from "./vault";
import type { TokenMetadata } from "./tokens";

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)"
];

const TESTNETS = new Set([11155111, 84532]);
const RPC: Record<number, string> = {
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  84532: "https://sepolia.base.org"
};

const RPC_OVERRIDE: Record<number, string | undefined> = {
  11155111: process.env.EXPO_PUBLIC_SEPOLIA_RPC_URL,
  84532: process.env.EXPO_PUBLIC_BASE_SEPOLIA_RPC_URL
};

type FeeQuote =
  | { kind: "eip1559"; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint; cap: bigint }
  | { kind: "legacy"; gasPrice: bigint; cap: bigint };

function feeQuote(data: Awaited<ReturnType<JsonRpcProvider["getFeeData"]>>): FeeQuote {
  if (data.maxFeePerGas && data.maxPriorityFeePerGas) {
    return { kind: "eip1559", maxFeePerGas: data.maxFeePerGas, maxPriorityFeePerGas: data.maxPriorityFeePerGas, cap: data.maxFeePerGas };
  }
  if (data.gasPrice) return { kind: "legacy", gasPrice: data.gasPrice, cap: data.gasPrice };
  throw new Error("The network did not return usable gas fee data.");
}

function providerFor(network: EvmNetwork) {
  if (!TESTNETS.has(network.chainId)) {
    throw new Error("ERC-20 transfers are restricted to Sepolia testnets in this development build.");
  }
  const rpc = RPC_OVERRIDE[network.chainId] || RPC[network.chainId];
  if (!rpc) throw new Error("No testnet RPC endpoint is configured.");
  return new JsonRpcProvider(rpc, network.chainId, { staticNetwork: true });
}

function parseTokenAmount(amount: string, decimals: number) {
  if (!/^\d+(\.\d+)?$/.test(amount.trim())) throw new Error("Enter a valid token amount.");
  const value = parseUnits(amount.trim(), decimals);
  if (value <= 0n) throw new Error("Amount must be greater than zero.");
  return value;
}

async function checkChain(provider: JsonRpcProvider, network: EvmNetwork) {
  const chainHex = await provider.send("eth_chainId", []);
  if (Number(BigInt(chainHex)) !== network.chainId) throw new Error("RPC chain mismatch. Transfer stopped.");
}

export type Erc20TransferPreview = {
  recipient: string;
  amount: string;
  symbol: string;
  tokenBalance: string;
  networkFee: string;
  maximumTotal: string;
  contractAddress: string;
};

export async function prepareErc20Transfer(
  network: EvmNetwork,
  from: string,
  token: TokenMetadata,
  recipient: string,
  amount: string
): Promise<Erc20TransferPreview> {
  if (token.chainId !== network.chainId) throw new Error("This token belongs to a different network.");
  if (!isAddress(token.contractAddress) || !isAddress(recipient)) throw new Error("Check the token and recipient addresses.");
  const value = parseTokenAmount(amount, token.decimals);
  const provider = providerFor(network);
  try {
    await checkChain(provider, network);
    const code = await provider.getCode(token.contractAddress);
    if (code === "0x") throw new Error("Token contract code was not found on this network.");
    const contract = new Contract(token.contractAddress, ERC20_ABI, provider);
    const [symbol, decimals, tokenBalance, nativeBalance, feeData] = await Promise.all([
      contract.getFunction("symbol")(),
      contract.getFunction("decimals")(),
      contract.getFunction("balanceOf")(from),
      provider.getBalance(from),
      provider.getFeeData()
    ]);
    if (String(symbol) !== token.symbol || Number(decimals) !== token.decimals) {
      throw new Error("Token metadata changed. Remove and re-add this token after verifying its contract.");
    }
    if (tokenBalance < value) throw new Error("Insufficient token balance.");
    const data = contract.interface.encodeFunctionData("transfer", [recipient, value]);
    const gasLimit = await provider.estimateGas({ from, to: token.contractAddress, data });
    const fee = feeQuote(feeData);
    const maxFee = gasLimit * fee.cap;
    if (nativeBalance < maxFee) throw new Error("Insufficient native balance to pay the network fee.");
    return {
      recipient,
      amount: amount.trim(),
      symbol: token.symbol,
      tokenBalance: formatUnits(tokenBalance, token.decimals),
      networkFee: formatEther(maxFee),
      maximumTotal: formatEther(maxFee),
      contractAddress: token.contractAddress
    };
  } finally {
    provider.destroy();
  }
}

export async function sendErc20Transfer(
  network: EvmNetwork,
  wallet: StoredWallet,
  token: TokenMetadata,
  recipient: string,
  amount: string
): Promise<string> {
  if (token.chainId !== network.chainId) throw new Error("This token belongs to a different network.");
  if (!isAddress(token.contractAddress) || !isAddress(recipient)) throw new Error("Check the token and recipient addresses.");
  const value = parseTokenAmount(amount, token.decimals);
  const provider = providerFor(network);
  try {
    await checkChain(provider, network);
    const mnemonic = Mnemonic.fromPhrase(wallet.mnemonic);
    const signer = HDNodeWallet.fromMnemonic(mnemonic, wallet.derivationPath).connect(provider);
    if (signer.address.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error("The protected wallet does not match its saved public address.");
    }
    const code = await provider.getCode(token.contractAddress);
    if (code === "0x") throw new Error("Token contract code was not found on this network.");
    const contract = new Contract(token.contractAddress, ERC20_ABI, signer);
    const [symbol, decimals, tokenBalance, nativeBalance, feeData] = await Promise.all([
      contract.getFunction("symbol")(),
      contract.getFunction("decimals")(),
      contract.getFunction("balanceOf")(signer.address),
      provider.getBalance(signer.address),
      provider.getFeeData()
    ]);
    if (String(symbol) !== token.symbol || Number(decimals) !== token.decimals) {
      throw new Error("Token metadata changed. Transfer stopped.");
    }
    if (tokenBalance < value) throw new Error("Insufficient token balance.");
    const data = contract.interface.encodeFunctionData("transfer", [recipient, value]);
    const gasLimit = await provider.estimateGas({ from: signer.address, to: token.contractAddress, data });
    const fee = feeQuote(feeData);
    if (nativeBalance < gasLimit * fee.cap) throw new Error("Insufficient native balance to pay the network fee.");
    const request = {
      to: token.contractAddress,
      data,
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
