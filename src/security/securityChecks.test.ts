import { Interface, MaxUint256 } from "ethers";
import { decodeApprovalCall, encodeRevoke, isUnlimitedApproval, parseExactAmount, rewriteApprovalAmount, suggestExactAmount } from "./approvalRewrite";
import { PERMIT2_ADDRESS, decodePermit, isFarFuture, parseTypedData, summarizeTypedData, typesForSigning } from "./typedData";
import { reviewMessage, reviewTransaction, reviewTypedData, siweDomain, type SimulationResult } from "./review";
import { analyzeEvmTransaction } from "./analyzeTransaction";

const SPENDER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const TOKEN = "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC";
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const iface = new Interface([
  "function approve(address,uint256)",
  "function approve(address,address,uint160,uint48)",
  "function setApprovalForAll(address,bool)",
  "function transfer(address,uint256)"
]);
const unlimitedApprove = iface.encodeFunctionData("approve(address,uint256)", [SPENDER, MaxUint256]);

describe("approval amount rewrite", () => {
  it("detects unlimited and near-max approvals", () => {
    expect(isUnlimitedApproval(unlimitedApprove)).toBe(true);
    expect(isUnlimitedApproval(iface.encodeFunctionData("approve(address,uint256)", [SPENDER, (1n << 255n) + 5n]))).toBe(true);
    expect(isUnlimitedApproval(iface.encodeFunctionData("approve(address,uint256)", [SPENDER, 1000n]))).toBe(false);
    expect(isUnlimitedApproval(iface.encodeFunctionData("transfer", [SPENDER, MaxUint256]))).toBe(false);
    expect(isUnlimitedApproval("0x")).toBe(false);
    expect(isUnlimitedApproval(null)).toBe(false);
  });

  it("rewrites only the amount of an ERC-20 approve", () => {
    const rewritten = rewriteApprovalAmount(unlimitedApprove, 25_000000n);
    const call = decodeApprovalCall(rewritten);
    expect(call).toEqual({ kind: "erc20", spender: SPENDER, amount: 25_000000n, unlimited: false });
    expect(rewritten.slice(0, 10)).toBe(unlimitedApprove.slice(0, 10));
  });

  it("rewrites Permit2 approve keeping token, spender and expiration", () => {
    const data = iface.encodeFunctionData("approve(address,address,uint160,uint48)", [TOKEN, SPENDER, (1n << 160n) - 1n, 1_900_000_000]);
    expect(isUnlimitedApproval(data)).toBe(true);
    const call = decodeApprovalCall(rewriteApprovalAmount(data, 5n));
    expect(call).toEqual({ kind: "permit2", token: TOKEN, spender: SPENDER, amount: 5n, expiration: 1_900_000_000, unlimited: false });
    expect(() => rewriteApprovalAmount(data, 1n << 161n)).toThrow();
  });

  it("refuses to rewrite non-approvals or negative amounts", () => {
    expect(() => rewriteApprovalAmount(iface.encodeFunctionData("transfer", [SPENDER, 1n]), 1n)).toThrow();
    expect(() => rewriteApprovalAmount(iface.encodeFunctionData("setApprovalForAll", [SPENDER, true]), 1n)).toThrow();
    expect(() => rewriteApprovalAmount(unlimitedApprove, -1n)).toThrow();
    expect(() => rewriteApprovalAmount("0xdeadbeef", 1n)).toThrow();
  });

  it("parses user amounts with token decimals", () => {
    expect(parseExactAmount("12.5", 6)).toBe(12_500000n);
    expect(parseExactAmount(" 1 ", 18)).toBe(10n ** 18n);
    expect(() => parseExactAmount("1.1234567", 6)).toThrow(/6 decimal/);
    expect(() => parseExactAmount("0", 6)).toThrow();
    expect(() => parseExactAmount("abc", 6)).toThrow();
    expect(() => parseExactAmount("-1", 6)).toThrow();
  });

  it("suggests a hint first, then the balance, never unlimited", () => {
    expect(suggestExactAmount({ hint: 5n, balance: 100n })).toBe(5n);
    expect(suggestExactAmount({ balance: 100n })).toBe(100n);
    expect(suggestExactAmount({})).toBeNull();
  });

  it("encodes revokes as zero approvals", () => {
    expect(decodeApprovalCall(encodeRevoke({ kind: "erc20", spender: SPENDER, amount: 1n, unlimited: false }).data)).toMatchObject({ amount: 0n });
    expect(decodeApprovalCall(encodeRevoke({ kind: "setApprovalForAll", operator: SPENDER, approved: true }).data)).toEqual({ kind: "setApprovalForAll", operator: SPENDER, approved: false });
    expect(decodeApprovalCall(encodeRevoke({ kind: "permit2", token: TOKEN, spender: SPENDER, amount: 1n, expiration: 1, unlimited: false }).data)).toMatchObject({ kind: "permit2", amount: 0n, expiration: 0 });
  });
});

const eip2612 = {
  types: {
    EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
    Permit: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }]
  },
  primaryType: "Permit",
  domain: { name: "USD Coin", version: "2", chainId: 84532, verifyingContract: TOKEN },
  message: { owner: OWNER, spender: SPENDER, value: MaxUint256.toString(), nonce: 0, deadline: "1900000000" }
};

const permit2Single = {
  types: {
    EIP712Domain: [{ name: "name", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }],
    PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }],
    PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }]
  },
  primaryType: "PermitSingle",
  domain: { name: "Permit2", chainId: 11155111, verifyingContract: PERMIT2_ADDRESS },
  message: { details: { token: TOKEN, amount: ((1n << 160n) - 1n).toString(), expiration: ((1n << 48n) - 1n).toString(), nonce: 0 }, spender: SPENDER, sigDeadline: "1800000000" }
};

describe("Permit / Permit2 decoding", () => {
  it("decodes EIP-2612 permits with spender, amount and deadline", () => {
    const permit = decodePermit(parseTypedData(JSON.stringify(eip2612)))!;
    expect(permit.kind).toBe("eip2612");
    expect(permit.spender).toBe(SPENDER);
    expect(permit.owner).toBe(OWNER);
    expect(permit.grants[0]).toMatchObject({ token: TOKEN, amount: MaxUint256, unlimited: true });
    expect(permit.deadline).toBe(1_900_000_000);
  });

  it("decodes Permit2 PermitSingle including token and expiry", () => {
    const permit = decodePermit(parseTypedData(permit2Single))!;
    expect(permit.kind).toBe("permit2-single");
    expect(permit.grants[0]).toMatchObject({ token: TOKEN, unlimited: true });
    expect(isFarFuture(permit.grants[0].expiry, 1_700_000_000)).toBe(true);
    expect(permit.deadline).toBe(1_800_000_000);
  });

  it("decodes Permit2 batches and signature transfers", () => {
    const batch = {
      ...permit2Single,
      primaryType: "PermitBatch",
      types: { ...permit2Single.types, PermitBatch: [{ name: "details", type: "PermitDetails[]" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }] },
      message: { details: [{ token: TOKEN, amount: "10", expiration: "1800000000", nonce: 0 }, { token: SPENDER, amount: "20", expiration: "0", nonce: 1 }], spender: SPENDER, sigDeadline: "1" }
    };
    const decoded = decodePermit(parseTypedData(batch))!;
    expect(decoded.kind).toBe("permit2-batch");
    expect(decoded.grants.map((g) => g.amount)).toEqual([10n, 20n]);
    const transfer = {
      ...permit2Single,
      primaryType: "PermitTransferFrom",
      types: { ...permit2Single.types, PermitTransferFrom: [{ name: "permitted", type: "TokenPermissions" }, { name: "spender", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }], TokenPermissions: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }] },
      message: { permitted: { token: TOKEN, amount: "99" }, spender: SPENDER, nonce: 1, deadline: "1800000000" }
    };
    expect(decodePermit(parseTypedData(transfer))).toMatchObject({ kind: "permit2-transfer", grants: [{ token: TOKEN, amount: 99n }] });
  });

  it("decodes DAI-style permits", () => {
    const dai = {
      types: { Permit: [{ name: "holder", type: "address" }, { name: "spender", type: "address" }, { name: "nonce", type: "uint256" }, { name: "expiry", type: "uint256" }, { name: "allowed", type: "bool" }] },
      primaryType: "Permit",
      domain: { name: "Dai Stablecoin", chainId: 1, verifyingContract: TOKEN },
      message: { holder: OWNER, spender: SPENDER, nonce: 0, expiry: 0, allowed: true }
    };
    expect(decodePermit(parseTypedData(dai))).toMatchObject({ kind: "dai", owner: OWNER, grants: [{ unlimited: true }] });
  });

  it("ignores non-permit typed data and rejects malformed input", () => {
    const mail = { types: { Mail: [{ name: "contents", type: "string" }] }, primaryType: "Mail", domain: { chainId: 84532 }, message: { contents: "hi" } };
    expect(summarizeTypedData(mail)).toMatchObject({ chainId: 84532, permit: null });
    expect(() => parseTypedData("{bad")).toThrow();
    expect(() => parseTypedData({ types: {}, primaryType: "X", message: {} })).toThrow();
    expect(typesForSigning(parseTypedData(eip2612))).not.toHaveProperty("EIP712Domain");
  });
});

const okSimulation: SimulationResult = { status: "success", value: 0n, insufficientFunds: false, toIsContract: true, balance: 10n ** 18n, maxFee: 1000n };

describe("review checks", () => {
  const base = { activeChainId: 84532, to: TOKEN, data: unlimitedApprove, analysis: analyzeEvmTransaction(unlimitedApprove), approval: decodeApprovalCall(unlimitedApprove), simulation: okSimulation, firstInteraction: false, symbol: "ETH" };

  it("flags unlimited approvals as critical", () => {
    const review = reviewTransaction(base);
    expect(review.level).toBe("critical");
    expect(review.blockedReason).toBeNull();
    expect(review.findings.map((f) => f.title)).toContain("Unlimited token approval");
  });

  it("blocks mainnet signing with a clear message", () => {
    const review = reviewTransaction({ ...base, activeChainId: 1 });
    expect(review.blockedReason).toMatch(/Mainnet signing is disabled/);
    expect(reviewMessage({ activeChainId: 8453, displayMessage: "hi", rawMessage: "hi", origin: "https://a.example" }).blockedReason).toMatch(/Mainnet/);
  });

  it("blocks chain mismatches and insufficient funds", () => {
    expect(reviewTransaction({ ...base, requestedChainId: 11155111 }).blockedReason).toMatch(/Chain mismatch/);
    const poor = reviewTransaction({ ...base, simulation: { ...okSimulation, insufficientFunds: true, value: 5n, balance: 1n } });
    expect(poor.blockedReason).toMatch(/Not enough ETH/);
  });

  it("reports reverts, unavailable simulation, EOAs, first interactions and setApprovalForAll", () => {
    const transfer = { ...base, data: "0x", analysis: analyzeEvmTransaction("0x"), approval: null };
    expect(reviewTransaction({ ...transfer, simulation: { ...okSimulation, status: "reverted", revertReason: "nope" } }).findings.map((f) => f.detail).join()).toContain("nope");
    expect(reviewTransaction({ ...transfer, simulation: { ...okSimulation, status: "unavailable", error: "timeout" } }).findings.map((f) => f.title)).toContain("Simulation unavailable");
    expect(reviewTransaction({ ...transfer, simulation: { ...okSimulation, toIsContract: false } }).findings.map((f) => f.title)).toContain("Destination is a regular address");
    expect(reviewTransaction({ ...transfer, data: "0x1234", simulation: { ...okSimulation, toIsContract: false } }).findings.map((f) => f.title)).toContain("Data sent to a regular address");
    expect(reviewTransaction({ ...transfer, firstInteraction: true }).findings.map((f) => f.title)).toContain("First interaction");
    const nft = iface.encodeFunctionData("setApprovalForAll", [SPENDER, true]);
    const nftReview = reviewTransaction({ ...base, data: nft, analysis: analyzeEvmTransaction(nft), approval: decodeApprovalCall(nft) });
    expect(nftReview.level).toBe("critical");
  });

  it("reviews typed data permits and chain rules", () => {
    const now = 1_700_000_000;
    const ok = reviewTypedData({ activeChainId: 11155111, summary: summarizeTypedData(permit2Single), nowSeconds: now, origin: "https://app" });
    expect(ok.blockedReason).toBeNull();
    expect(ok.level).toBe("critical");
    expect(ok.findings.map((f) => f.detail).join()).toContain("never (maximum value)");
    const mismatch = reviewTypedData({ activeChainId: 84532, summary: summarizeTypedData(permit2Single), nowSeconds: now, origin: "https://app" });
    expect(mismatch.blockedReason).toMatch(/Chain mismatch/);
    const mainnetPermit = reviewTypedData({ activeChainId: 84532, summary: summarizeTypedData({ ...eip2612, domain: { ...eip2612.domain, chainId: 1 } }), nowSeconds: now, origin: "https://app" });
    expect(mainnetPermit.blockedReason).toBeTruthy();
  });

  it("detects Sign-In with Ethereum domain mismatches", () => {
    const message = "evil.example wants you to sign in with your Ethereum account:\n0xabc\n\nURI: https://evil.example";
    expect(siweDomain(message)).toBe("evil.example");
    expect(reviewMessage({ activeChainId: 84532, displayMessage: message, rawMessage: message, origin: "https://good.example" }).level).toBe("critical");
    expect(reviewMessage({ activeChainId: 84532, displayMessage: message, rawMessage: message, origin: "https://evil.example" }).level).toBe("info");
    expect(reviewMessage({ activeChainId: 84532, displayMessage: "0x00ff", rawMessage: "0x00ff", origin: "https://a" }).level).toBe("warning");
  });
});
