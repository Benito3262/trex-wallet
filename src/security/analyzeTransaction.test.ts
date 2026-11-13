import { Interface, MaxUint256 } from "ethers";
import { analyzeEvmTransaction } from "./analyzeTransaction";

const erc20 = new Interface([
  "function approve(address spender,uint256 value)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function setApprovalForAll(address operator,bool approved)",
  "function transfer(address to,uint256 value)"
]);

describe("EVM transaction risk analysis", () => {
  it("flags maximum ERC-20 approvals as critical", () => {
    const data = erc20.encodeFunctionData("approve", [
      "0x000000000000000000000000000000000000dead",
      MaxUint256
    ]);
    const result = analyzeEvmTransaction(data);
    expect(result.method).toBe("ERC-20 approve");
    expect(result.riskLevel).toBe("critical");
    expect(result.warnings.some((warning) => warning.includes("unlimited"))).toBe(true);
  });

  it("flags maximum EIP-2612 permits as critical", () => {
    const data = erc20.encodeFunctionData("permit", [
      "0x000000000000000000000000000000000000beef",
      "0x000000000000000000000000000000000000dead",
      MaxUint256,
      2000000000,
      27,
      `0x${"11".repeat(32)}`,
      `0x${"22".repeat(32)}`
    ]);
    const result = analyzeEvmTransaction(data);
    expect(result.method).toBe("ERC-20 permit");
    expect(result.riskLevel).toBe("critical");
  });

  it("flags operator-wide approvals as critical", () => {
    const data = erc20.encodeFunctionData("setApprovalForAll", [
      "0x000000000000000000000000000000000000dead",
      true
    ]);
    expect(analyzeEvmTransaction(data).riskLevel).toBe("critical");
  });

  it("recognizes a basic token transfer without claiming it is safe", () => {
    const data = erc20.encodeFunctionData("transfer", [
      "0x000000000000000000000000000000000000dead",
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
