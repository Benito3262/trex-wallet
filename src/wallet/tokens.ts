import { Contract, formatUnits, isAddress } from "ethers";
import type { EvmNetwork } from "../config/networks";
import { answerError, withProvider } from "./rpcPool";

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
  return withProvider(network, async (provider) => {
    const code = await provider.getCode(contractAddress);
    if (code === "0x") throw answerError("No contract code was found at that address on this network.");

    const contract = new Contract(contractAddress, ERC20_READ_ABI, provider);
    const [symbol, name, decimalsValue, balance] = await Promise.all([
      contract.getFunction("symbol")(),
      contract.getFunction("name")().catch(() => ""),
      contract.getFunction("decimals")(),
      contract.getFunction("balanceOf")(walletAddress)
    ]);
    const decimals = Number(decimalsValue);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
      throw answerError("The token returned an unsupported decimal count.");
    }
    const safeSymbol = String(symbol).trim();
    if (!safeSymbol || safeSymbol.length > 16) {
      throw answerError("The token returned an invalid symbol.");
    }
    return {
      chainId: network.chainId,
      contractAddress,
      name: String(name || safeSymbol).slice(0, 80),
      symbol: safeSymbol,
      decimals,
      balance: formatUnits(balance, decimals)
    };
  }, 15000);
}
