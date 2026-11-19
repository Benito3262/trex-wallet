import { routeRequest, decodePersonalMessage, parseChainId, type RequestContext, type SignRequest } from "./router";
import { ApprovalQueue, MAX_PENDING_PER_ORIGIN } from "./approvalCenter";
import { parseBridgeMessage, originOf, assertSecureOrigin } from "./browserBridge";
import { buildReceiveScript, buildProviderScript } from "./providerScript";
import { toRpcError, ProviderRpcError } from "./errors";

const ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

function makeContext(overrides: Partial<RequestContext> = {}) {
  let connected = false;
  let chainId = 84532;
  const signatures: SignRequest[] = [];
  const reads: [string, unknown[]][] = [];
  const ctx: RequestContext = {
    origin: "https://app.example",
    source: "browser",
    getActiveAddress: () => ACCOUNT,
    getChainId: () => chainId,
    isConnected: () => connected,
    requestConnection: jest.fn(async () => { connected = true; return true; }),
    requestChainSwitch: jest.fn(async (id: number) => { chainId = id; return true; }),
    requestSignature: jest.fn(async (request: SignRequest) => { signatures.push(request); return "0xsigned"; }),
    disconnect: jest.fn(async () => { connected = false; }),
    readRpc: jest.fn(async (method: string, params: unknown[]) => { reads.push([method, params]); return "0x1"; }),
    ...overrides
  };
  return { ctx, signatures, reads, setConnected: (v: boolean) => { connected = v; } };
}

describe("provider request routing", () => {
  it("answers chain and account queries without prompting", async () => {
    const { ctx } = makeContext();
    expect(await routeRequest(ctx, "eth_chainId", [])).toBe("0x14a34");
    expect(await routeRequest(ctx, "net_version", [])).toBe("84532");
    expect(await routeRequest(ctx, "eth_accounts", [])).toEqual([]);
    expect(ctx.requestConnection).not.toHaveBeenCalled();
  });

  it("asks once to connect, then returns the account", async () => {
    const { ctx } = makeContext();
    expect(await routeRequest(ctx, "eth_requestAccounts", [])).toEqual([ACCOUNT]);
    expect(await routeRequest(ctx, "eth_requestAccounts", [])).toEqual([ACCOUNT]);
    expect(await routeRequest(ctx, "eth_accounts", [])).toEqual([ACCOUNT]);
    expect(ctx.requestConnection).toHaveBeenCalledTimes(1);
  });

  it("rejects with 4001 when the user declines the connection", async () => {
    const { ctx } = makeContext({ requestConnection: jest.fn(async () => false) });
    await expect(routeRequest(ctx, "eth_requestAccounts", [])).rejects.toMatchObject({ code: 4001 });
  });

  it("refuses to sign anything for a site that is not connected", async () => {
    const { ctx } = makeContext();
    await expect(routeRequest(ctx, "personal_sign", ["0x68656c6c6f", ACCOUNT])).rejects.toMatchObject({ code: 4100 });
    await expect(routeRequest(ctx, "eth_sendTransaction", [{ from: ACCOUNT, to: OTHER }])).rejects.toMatchObject({ code: 4100 });
    await expect(routeRequest(ctx, "eth_signTypedData_v4", [ACCOUNT, "{}"])).rejects.toMatchObject({ code: 4100 });
    expect(ctx.requestSignature).not.toHaveBeenCalled();
  });

  it("routes personal_sign in either parameter order and decodes the text", async () => {
    const { ctx, signatures, setConnected } = makeContext();
    setConnected(true);
    await routeRequest(ctx, "personal_sign", ["0x68656c6c6f", ACCOUNT]);
    await routeRequest(ctx, "personal_sign", [ACCOUNT, "0x68656c6c6f"]);
    expect(signatures).toHaveLength(2);
    expect(signatures.every((s) => s.kind === "personal_sign" && s.displayMessage === "hello")).toBe(true);
  });

  it("rejects signing for an address other than the connected account", async () => {
    const { ctx, setConnected } = makeContext();
    setConnected(true);
    await expect(routeRequest(ctx, "personal_sign", ["0x68656c6c6f", OTHER])).rejects.toMatchObject({ code: 4100 });
    await expect(routeRequest(ctx, "eth_signTypedData_v4", [OTHER, "{}"])).rejects.toMatchObject({ code: 4100 });
    await expect(routeRequest(ctx, "eth_sendTransaction", [{ from: OTHER, to: ACCOUNT }])).rejects.toMatchObject({ code: 4100 });
  });

  it("normalizes transactions and validates fields", async () => {
    const { ctx, signatures, setConnected } = makeContext();
    setConnected(true);
    await routeRequest(ctx, "eth_sendTransaction", [{ from: ACCOUNT.toLowerCase(), to: OTHER.toLowerCase(), value: 16, input: "0x1234", gasLimit: "0x5208" }]);
    const tx = (signatures[0] as Extract<SignRequest, { kind: "transaction" }>).tx;
    expect(tx).toMatchObject({ from: ACCOUNT, to: OTHER, value: "0x10", data: "0x1234", gas: "0x5208" });
    await expect(routeRequest(ctx, "eth_sendTransaction", [{ from: ACCOUNT, to: "nope" }])).rejects.toMatchObject({ code: -32602 });
    await expect(routeRequest(ctx, "eth_sendTransaction", [{ from: ACCOUNT, to: OTHER, data: "zz" }])).rejects.toMatchObject({ code: -32602 });
    await expect(routeRequest(ctx, "eth_sendTransaction", [null])).rejects.toMatchObject({ code: -32602 });
  });

  it("switches only to supported chains, with approval", async () => {
    const { ctx } = makeContext();
    expect(await routeRequest(ctx, "wallet_switchEthereumChain", [{ chainId: "0xaa36a7" }])).toBeNull();
    expect(ctx.getChainId()).toBe(11155111);
    await expect(routeRequest(ctx, "wallet_switchEthereumChain", [{ chainId: "0x539" }])).rejects.toMatchObject({ code: 4902 });
    await expect(routeRequest(ctx, "wallet_addEthereumChain", [{ chainId: "0x539" }])).rejects.toMatchObject({ code: 4200 });
    await expect(routeRequest(ctx, "wallet_switchEthereumChain", [{}])).rejects.toMatchObject({ code: -32602 });
    // Already on the chain: no prompt.
    (ctx.requestChainSwitch as jest.Mock).mockClear();
    await routeRequest(ctx, "wallet_switchEthereumChain", [{ chainId: "0xaa36a7" }]);
    expect(ctx.requestChainSwitch).not.toHaveBeenCalled();
  });

  it("rejects a declined chain switch with 4001", async () => {
    const { ctx } = makeContext({ requestChainSwitch: jest.fn(async () => false) });
    await expect(routeRequest(ctx, "wallet_switchEthereumChain", [{ chainId: "0x1" }])).rejects.toMatchObject({ code: 4001 });
  });

  it("passes whitelisted reads through and blocks dangerous or unknown methods", async () => {
    const { ctx, reads } = makeContext();
    await routeRequest(ctx, "eth_blockNumber", []);
    await routeRequest(ctx, "eth_call", [{ to: OTHER, data: "0x" }, "latest"]);
    expect(reads.map((r) => r[0])).toEqual(["eth_blockNumber", "eth_call"]);
    for (const method of ["eth_sign", "eth_signTransaction", "eth_sendRawTransaction", "foo_bar"]) {
      await expect(routeRequest(ctx, method, [])).rejects.toMatchObject({ code: 4200 });
    }
  });

  it("supports permissions and revocation", async () => {
    const { ctx } = makeContext();
    expect(await routeRequest(ctx, "wallet_getPermissions", [])).toEqual([]);
    const granted = await routeRequest(ctx, "wallet_requestPermissions", [{ eth_accounts: {} }]);
    expect(granted).toEqual([expect.objectContaining({ parentCapability: "eth_accounts" })]);
    await routeRequest(ctx, "wallet_revokePermissions", [{ eth_accounts: {} }]);
    expect(await routeRequest(ctx, "eth_accounts", [])).toEqual([]);
  });

  it("parses chain ids and messages defensively", () => {
    expect(parseChainId("0x1")).toBe(1);
    expect(parseChainId("137")).toBe(137);
    expect(() => parseChainId("0x0")).toThrow();
    expect(() => parseChainId(undefined)).toThrow();
    expect(decodePersonalMessage("0x00ff10")).toBe("0x00ff10");
    expect(decodePersonalMessage("plain text")).toBe("plain text");
  });
});

describe("approval queue", () => {
  const peer = { origin: "https://a.example", source: "browser" as const };

  it("shows requests one at a time and settles each exactly once", async () => {
    const queue = new ApprovalQueue();
    const heads: (number | null)[] = [];
    queue.subscribe((head) => heads.push(head?.id ?? null));
    const first = queue.ask({ type: "connect", peer, chainId: 1 });
    const second = queue.ask({ type: "switchChain", peer, chainId: 1 });
    expect(queue.size()).toBe(2);
    const head = queue.head()!;
    head.resolve(true as never);
    head.resolve(false as never);
    await expect(first).resolves.toBe(true);
    queue.head()!.reject(new Error("no"));
    await expect(second).rejects.toThrow("no");
    expect(queue.size()).toBe(0);
    expect(heads[heads.length - 1]).toBeNull();
  });

  it("caps pending requests per origin", async () => {
    const queue = new ApprovalQueue();
    for (let i = 0; i < MAX_PENDING_PER_ORIGIN; i++) queue.ask({ type: "connect", peer, chainId: 1 }).catch(() => undefined);
    await expect(queue.ask({ type: "connect", peer, chainId: 1 })).rejects.toMatchObject({ code: -32002 });
    // Another site is not affected.
    const other = queue.ask({ type: "connect", peer: { ...peer, origin: "https://b.example" }, chainId: 1 });
    queue.cancelAll();
    await expect(other).rejects.toMatchObject({ code: 4001 });
  });

  it("cancels only the requests of one origin", async () => {
    const queue = new ApprovalQueue();
    const a = queue.ask({ type: "connect", peer, chainId: 1 });
    const b = queue.ask({ type: "connect", peer: { ...peer, origin: "https://b.example" }, chainId: 1 });
    queue.cancelOrigin(peer.origin);
    await expect(a).rejects.toMatchObject({ code: 4001 });
    expect(queue.size()).toBe(1);
    queue.head()!.resolve(true as never);
    await expect(b).resolves.toBe(true);
  });
});

describe("browser bridge", () => {
  it("accepts only well-formed TREX messages", () => {
    expect(parseBridgeMessage(JSON.stringify({ __trex: 1, id: "trex-1", method: "eth_chainId", params: [] }))).toEqual({ id: "trex-1", method: "eth_chainId", params: [] });
    expect(parseBridgeMessage("not json")).toBeNull();
    expect(parseBridgeMessage(JSON.stringify({ id: "1", method: "eth_chainId" }))).toBeNull();
    expect(parseBridgeMessage(JSON.stringify({ __trex: 1, id: 5, method: "x" }))).toBeNull();
    expect(parseBridgeMessage("x".repeat(300_000))).toBeNull();
  });

  it("derives origins and refuses insecure sites", () => {
    expect(originOf("https://app.uniswap.org/swap?x=1")).toBe("https://app.uniswap.org");
    expect(originOf("javascript:alert(1)")).toBeNull();
    expect(() => assertSecureOrigin("http://evil.example")).toThrow(ProviderRpcError);
    expect(() => assertSecureOrigin("http://localhost:3000")).not.toThrow();
    expect(() => assertSecureOrigin("https://app.example")).not.toThrow();
  });

  it("escapes payloads injected back into the page", () => {
    const script = buildReceiveScript({ id: "1", result: "a\u2028b</script><script>alert(1)</script>" });
    expect(script).not.toContain("\u2028");
    expect(script).not.toMatch(/<\/script/i);
    expect(script.startsWith("window.__trexWallet")).toBe(true);
  });

  it("builds a provider script with EIP-6963 announcement and no secrets", () => {
    const script = buildProviderScript("1234");
    expect(script).toContain("eip6963:announceProvider");
    expect(script).toContain("eip6963:requestProvider");
    expect(script).toContain("com.trexwallet.app");
    expect(() => new Function(script)).not.toThrow();
  });

  it("serializes errors for the page", () => {
    expect(toRpcError(new ProviderRpcError(4001, "no"))).toEqual({ code: 4001, message: "no" });
    expect(toRpcError(new Error("boom"))).toEqual({ code: -32603, message: "boom" });
    expect(toRpcError("weird")).toMatchObject({ code: -32603 });
  });
});
