import {
  Contract,
  JsonRpcProvider,
  formatUnits,
  isAddress
} from "ethers";
import { rpcUrlFor, type EvmNetwork } from "../config/networks";

const ERC20_READ_ABI = [
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)"
];

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
  const rpcUrl = rpcUrlFor(network.chainId);

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
