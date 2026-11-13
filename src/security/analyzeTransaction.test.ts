import { Interface, MaxUint256 } from "ethers";
import { analyzeEvmTransaction } from "./analyzeTransaction";

const erc20 = new Interface([
  "function approve(address spender,uint256 value)",
  "function setApprovalForAll(address operator,bool approved)",
  "function transfer(address to,uint256 value)"
]);

describe("EVM transaction risk analysis", () => {
  it("flags maximum ERC-20 approvals as critical", () => {
    const data = erc20.encodeFunctionData("approve", [
      "0x000000000000000000000000000000000000dEaD",
      MaxUint256
    ]);
    const result = analyzeEvmTransaction(data);
    expect(result.method).toBe("ERC-20 approve");
    expect(result.riskLevel).toBe("critical");
    expect(result.warnings.some((warning) => warning.includes("unlimited"))).toBe(true);
  });

  it("flags operator-wide approvals as critical", () => {
    const data = erc20.encodeFunctionData("setApprovalForAll", [
      "0x000000000000000000000000000000000000dEaD",
      true
    ]);
    expect(analyzeEvmTransaction(data).riskLevel).toBe("critical");
  });

  it("recognizes a basic token transfer without claiming it is safe", () => {
    const data = erc20.encodeFunctionData("transfer", [
      "0x000000000000000000000000000000000000dEaD",
      1000n
    ]);
    const result = analyzeEvmTransaction(data);
    expect(result.method).toBe("ERC-20 transfer");
    expect(result.riskLevel).toBe("info");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("warns on unknown contract methods", () => {
    const result = analyzeEvmTransaction("0xdeadbeef");
    expect(result.riskLevel).toBe("warning");
    expect(result.method).toBe("Unknown contract call");
  });
});
