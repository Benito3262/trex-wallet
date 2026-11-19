import type { JsonRpcProvider } from "ethers";
import { NETWORKS, PUBLIC_RPCS, rpcUrlsFor, MAINNET_SIGNING_BLOCKED_MESSAGE } from "../config/networks";
import { KNOWN_TOKENS } from "../config/knownTokens";
import { answerError, isEndpointFailure, NetworkUnavailableError, orderedEndpoints, resetRpcPool, setProviderFactory, withProvider } from "./rpcPool";
import { balanceOfCalldata, discoverKnownTokenBalances } from "./tokenDiscovery";

const ethereum = NETWORKS.find((n) => n.chainId === 1)!;
type Behaviour = { chainId?: number; fail?: unknown; hang?: boolean; result?: unknown };

function install(behaviours: Record<string, Behaviour>) {
  const calls: string[] = [];
  setProviderFactory((url) => {
    const b = behaviours[url] ?? { fail: new Error("unreachable") };
    const run = (what: string, value: () => unknown) => {
      calls.push(`${url}:${what}`);
      if (b.hang) return new Promise(() => undefined);
      if (b.fail) return Promise.reject(b.fail);
      return Promise.resolve(value());
    };
    return {
      send: (method: string) => run(method, () => (method === "eth_chainId" ? "0x" + (b.chainId ?? 1).toString(16) : b.result)),
      getBalance: () => run("getBalance", () => b.result),
      call: () => run("call", () => b.result),
      destroy: () => undefined
    } as unknown as JsonRpcProvider;
  });
  return calls;
}

afterEach(() => { setProviderFactory(null); resetRpcPool(); jest.useRealTimers(); });

describe("RPC endpoints", () => {
  it("has several endpoints for every mainnet and drops the dead ones", () => {
    for (const id of [1, 8453, 56, 42161, 10, 137]) expect(PUBLIC_RPCS[id].length).toBeGreaterThanOrEqual(3);
    const all = Object.values(PUBLIC_RPCS).flat().join(" ");
    expect(all).not.toContain("cloudflare-eth.com");
    expect(all).not.toContain("polygon-rpc.com");
    expect(rpcUrlsFor(1)[0]).toBe("https://ethereum-rpc.publicnode.com");
    for (const url of Object.values(PUBLIC_RPCS).flat()) expect(url.startsWith("https://")).toBe(true);
  });

  it("uses a friendly mainnet lock message", () => {
    expect(MAINNET_SIGNING_BLOCKED_MESSAGE).toMatch(/balances and tokens work/);
    expect(MAINNET_SIGNING_BLOCKED_MESSAGE).not.toMatch(/disabled/i);
  });
});

describe("withProvider fallback", () => {
  const [a, b, c] = PUBLIC_RPCS[1];

  it("falls back to the next endpoint when one is down and remembers the good one", async () => {
    const calls = install({ [a]: { fail: Object.assign(new Error("Internal error"), { code: "SERVER_ERROR" }) }, [b]: { result: 5n } });
    await expect(withProvider(ethereum, (p) => p.getBalance("0x0000000000000000000000000000000000000001"))).resolves.toBe(5n);
    expect(calls[0]).toBe(`${a}:eth_chainId`);
    expect(orderedEndpoints(1)[0]).toBe(b);
    calls.length = 0;
    await withProvider(ethereum, (p) => p.getBalance("0x0000000000000000000000000000000000000001"));
    expect(calls).toEqual([`${b}:getBalance`]); // chain already verified, preferred endpoint first
  });

  it("times out a hanging endpoint and moves on", async () => {
    install({ [a]: { hang: true }, [b]: { result: 7n } });
    await expect(withProvider(ethereum, (p) => p.getBalance("0x0000000000000000000000000000000000000001"), 50)).resolves.toBe(7n);
  });

  it("skips an endpoint that reports the wrong chain", async () => {
    install({ [a]: { chainId: 137, result: 1n }, [b]: { result: 2n } });
    await expect(withProvider(ethereum, (p) => p.getBalance("0x0000000000000000000000000000000000000001"))).resolves.toBe(2n);
    expect(orderedEndpoints(1)).not.toContain(a);
  });

  it("does not retry a real answer such as a revert", async () => {
    const calls = install({ [a]: { result: 1n }, [b]: { result: 2n } });
    const revert = Object.assign(new Error("execution reverted"), { code: "CALL_EXCEPTION" });
    await expect(withProvider(ethereum, () => Promise.reject(revert))).rejects.toBe(revert);
    expect(calls.some((x) => x.startsWith(b))).toBe(false);
    await expect(withProvider(ethereum, () => Promise.reject(answerError("bad token")))).rejects.toThrow("bad token");
  });

  it("reports a friendly error when every endpoint fails", async () => {
    install({ [a]: { fail: new Error("403") }, [b]: { fail: new Error("525") }, [c]: { fail: new Error("timeout") } });
    const error = await withProvider(ethereum, (p) => p.getBalance("0x0000000000000000000000000000000000000001")).catch((e) => e);
    expect(error).toBeInstanceOf(NetworkUnavailableError);
    expect(error.message).toMatch(/Couldn't reach Ethereum/);
    expect(error.attempts).toHaveLength(3);
  });

  it("classifies errors", () => {
    expect(isEndpointFailure(Object.assign(new Error(), { code: "TIMEOUT" }))).toBe(true);
    expect(isEndpointFailure(Object.assign(new Error(), { code: "CALL_EXCEPTION" }))).toBe(false);
    expect(isEndpointFailure({ code: "UNKNOWN_ERROR", error: { code: -32602 } })).toBe(false);
    expect(isEndpointFailure({ code: "UNKNOWN_ERROR", error: { code: -32603 } })).toBe(true);
  });
});

describe("known token discovery", () => {
  it("has well-formed lists for every mainnet", () => {
    for (const id of [1, 8453, 56, 42161, 10, 137]) {
      expect(KNOWN_TOKENS[id].length).toBeGreaterThan(2);
      for (const t of KNOWN_TOKENS[id]) expect(t.contractAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it("encodes balanceOf and keeps only non-zero balances", async () => {
    expect(balanceOfCalldata("0x0000000000000000000000000000000000000001")).toBe("0x70a08231" + "0".repeat(63) + "1");
    const [a] = PUBLIC_RPCS[1];
    install({ [a]: { result: "0x" + (2_500_000n).toString(16).padStart(64, "0") } });
    const found = await discoverKnownTokenBalances(ethereum, "0x0000000000000000000000000000000000000001");
    expect(found.find((t) => t.symbol === "USDC")?.balance).toBe("2.5");
    install({ [a]: { result: "0x" + "0".repeat(64) } });
    resetRpcPool();
    await expect(discoverKnownTokenBalances(ethereum, "0x0000000000000000000000000000000000000001")).resolves.toEqual([]);
  });
});
