import {
  Contract,
  JsonRpcProvider,
  formatUnits,
  isAddress
} from "ethers";
import type { EvmNetwork } from "../config/networks";

const ERC20_READ_ABI = [
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)"
];

const TOKEN_RPC: Record<number, string> = {
  1: "https://cloudflare-eth.com",
  8453: "https://mainnet.base.org",
  56: "https://bsc-dataseed.binance.org",
  42161: "https://arb1.arbitrum.io/rpc",
  10: "https://mainnet.optimism.io",
  137: "https://polygon-rpc.com",
  11155111: "https://ethereum-sepolia-rpc.publicnode.com",
  84532: "https://sepolia.base.org"
};

export type TokenMetadata = {
  chainId: number;
  contractAddress: string;
  name: string;
  symbol: string;
  decimals: number;
};

export type TokenBalance = TokenMetadata & {
  balance: string;
};

export async function inspectErc20Token(
  network: EvmNetwork,
  contractAddress: string,
  walletAddress: string
): Promise<TokenBalance> {
  if (!isAddress(contractAddress)) throw new Error("Token contract address is invalid.");
  if (!isAddress(walletAddress)) throw new Error("Wallet address is invalid.");
  const rpcUrl = TOKEN_RPC[network.chainId];
  if (!rpcUrl) throw new Error("No RPC endpoint is configured for this network.");

  const provider = new JsonRpcProvider(rpcUrl, network.chainId, { staticNetwork: true });
  try {
    const chainHex = await provider.send("eth_chainId", []);
    if (Number(BigInt(chainHex)) !== network.chainId) {
      throw new Error("RPC chain mismatch. Token lookup was stopped.");
    }
    const code = await provider.getCode(contractAddress);
    if (code === "0x") throw new Error("No contract code was found at that address on this network.");

    const contract = new Contract(contractAddress, ERC20_READ_ABI, provider);
    const [symbol, name, decimalsValue, balance] = await Promise.all([
      contract.getFunction("symbol")(),
      contract.getFunction("name")().catch(() => ""),
      contract.getFunction("decimals")(),
      contract.getFunction("balanceOf")(walletAddress)
    ]);
    const decimals = Number(decimalsValue);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      throw new Error("The token returned an unsupported decimal count.");
    }
    const safeSymbol = String(symbol).trim();
    if (!safeSymbol || safeSymbol.length > 16) {
      throw new Error("The token returned an invalid symbol.");
    }
    return {
      chainId: network.chainId,
      contractAddress,
      name: String(name || safeSymbol).slice(0, 80),
      symbol: safeSymbol,
      decimals,
      balance: formatUnits(balance, decimals)
    };
  } finally {
    provider.destroy();
  }
}
