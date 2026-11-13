import { Interface, MaxUint256, isAddress } from "ethers";

const ERC20_INTERFACE = new Interface([
  "function approve(address spender,uint256 value)",
  "function approve(address token,address spender,uint160 amount,uint48 expiration)",
  "function permit(address owner,address spender,uint256 value,uint256 deadline,uint8 v,bytes32 r,bytes32 s)",
  "function setApprovalForAll(address operator,bool approved)",
  "function transfer(address to,uint256 value)",
  "function transferFrom(address from,address to,uint256 value)",
  "function increaseAllowance(address spender,uint256 addedValue)"
]);

export type RiskLevel = "info" | "warning" | "high" | "critical";

export type TransactionAnalysis = {
  method: string;
  selector: string;
  riskLevel: RiskLevel;
  summary: string;
  warnings: string[];
  addresses: string[];
  amountRaw?: string;
};

export function analyzeEvmTransaction(data: string): TransactionAnalysis {
  const selector = data.length >= 10 ? data.slice(0, 10).toLowerCase() : "0x";
  const warnings: string[] = [];

  if (selector === "0x") {
    return {
      method: "Native transfer or empty call",
      selector,
      riskLevel: "info",
      summary: "No contract method selector was supplied.",
      warnings: ["Verify the destination and network before signing."],
      addresses: []
    };
  }

  try {
    const parsed = ERC20_INTERFACE.parseTransaction({ data });
    if (!parsed) throw new Error("Unknown method selector.");

    if (parsed.signature === "approve(address,address,uint160,uint48)") {
      const token = String(parsed.args[0]);
      const spender = String(parsed.args[1]);
      const amount = BigInt(parsed.args[2]);
      const expiration = BigInt(parsed.args[3]);
      const unlimited = amount === (1n << 160n) - 1n;
      const revoking = amount === 0n;
      if (!revoking) warnings.push("Permit2 approval gives a spender permission over this token.");
      if (unlimited) warnings.push("The Permit2 amount is the maximum uint160 value.");
      if (expiration === (1n << 48n) - 1n) warnings.push("The Permit2 approval expiration is the maximum uint48 value.");
      return {
        method: "Permit2 approve",
        selector,
        riskLevel: revoking ? "info" : unlimited ? "critical" : "high",
        summary: revoking
          ? "This Permit2 call sets the token allowance to zero."
          : unlimited
            ? "This Permit2 call grants a maximum-size token allowance."
            : "This Permit2 call grants a token allowance to a spender.",
        warnings,
        addresses: [token, spender].filter((value) => isAddress(value)),
        amountRaw: amount.toString()
      };
    }

    if (parsed.name === "approve") {
      const spender = String(parsed.args[0]);
      const amount = BigInt(parsed.args[1]);
      const unlimited = amount === MaxUint256;
      const revoking = amount === 0n;
      if (!revoking) warnings.push("This call grants a spender permission to move your tokens.");
      if (unlimited) warnings.push("The approval amount is the maximum uint256 value and is effectively unlimited.");
      return {
        method: "ERC-20 approve",
        selector,
        riskLevel: revoking ? "info" : unlimited ? "critical" : "high",
        summary: revoking
          ? "This transaction sets the spender allowance to zero."
          : unlimited
            ? "This transaction grants effectively unlimited token spending permission."
            : "This transaction grants token spending permission to a third-party address.",
        warnings,
        addresses: isAddress(spender) ? [spender] : [],
        amountRaw: amount.toString()
      };
    }

    if (parsed.name === "permit") {
      const owner = String(parsed.args[0]);
      const spender = String(parsed.args[1]);
      const amount = BigInt(parsed.args[2]);
      const unlimited = amount === MaxUint256;
      const revoking = amount === 0n;
      if (!revoking) warnings.push("This call submits a signed permit that grants token spending permission.");
      if (unlimited) warnings.push("The permit amount is the maximum uint256 value and is effectively unlimited.");
      return {
        method: "ERC-20 permit",
        selector,
        riskLevel: revoking ? "info" : unlimited ? "critical" : "high",
        summary: revoking
          ? "This permit sets the spender allowance to zero."
          : unlimited
            ? "This permit grants effectively unlimited token spending permission."
            : "This permit grants token spending permission to a third-party address.",
        warnings,
        addresses: [owner, spender].filter((value) => isAddress(value)),
        amountRaw: amount.toString()
      };
    }

    if (parsed.name === "setApprovalForAll") {
      const operator = String(parsed.args[0]);
      const approved = Boolean(parsed.args[1]);
      if (approved) {
        warnings.push("The operator may manage all tokens in this collection or contract scope.");
      }
      return {
        method: "setApprovalForAll",
        selector,
        riskLevel: approved ? "critical" : "info",
        summary: approved
          ? "This enables an operator-wide approval. Review the operator carefully."
          : "This disables an operator-wide approval.",
        warnings,
        addresses: isAddress(operator) ? [operator] : []
      };
    }

    if (parsed.name === "transfer") {
      const recipient = String(parsed.args[0]);
      const amount = BigInt(parsed.args[1]);
      return {
        method: "ERC-20 transfer",
        selector,
        riskLevel: "info",
        summary: "This call transfers tokens to the specified recipient.",
        warnings: ["Verify the token contract and recipient independently."],
        addresses: isAddress(recipient) ? [recipient] : [],
        amountRaw: amount.toString()
      };
    }

    if (parsed.name === "transferFrom") {
      const owner = String(parsed.args[0]);
      const recipient = String(parsed.args[1]);
      const amount = BigInt(parsed.args[2]);
      return {
        method: "ERC-20 transferFrom",
        selector,
        riskLevel: "warning",
        summary: "This call attempts to move tokens from another address using an existing allowance.",
        warnings: ["Confirm the source address, recipient, token contract and allowance context."],
        addresses: [owner, recipient].filter((value) => isAddress(value)),
        amountRaw: amount.toString()
      };
    }

    if (parsed.name === "increaseAllowance") {
      const spender = String(parsed.args[0]);
      const amount = BigInt(parsed.args[1]);
      return {
        method: "increaseAllowance",
        selector,
        riskLevel: "high",
        summary: "This call increases a spender's token allowance.",
        warnings: ["Review the spender and resulting total allowance before signing."],
        addresses: isAddress(spender) ? [spender] : [],
        amountRaw: amount.toString()
      };
    }
  } catch {
    return {
      method: "Unknown contract call",
      selector,
      riskLevel: "warning",
      summary: "TREX could not decode this contract call using its built-in method catalogue.",
      warnings: ["Do not sign an unknown call unless you understand its exact effect."],
      addresses: []
    };
  }

  return {
    method: "Unknown contract call",
    selector,
    riskLevel: "warning",
    summary: "This method is not in the current decoder catalogue.",
    warnings: ["Do not sign an unknown call unless you understand its exact effect."],
    addresses: []
  };
}
