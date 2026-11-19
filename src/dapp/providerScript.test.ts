import { buildProviderScript, buildReceiveScript } from "./providerScript";

type Listener = (event: { type: string; detail?: unknown }) => void;

function makeWindow() {
  const posted: any[] = [];
  const listeners: Record<string, Listener[]> = {};
  const events: { type: string; detail?: any }[] = [];
  const win: any = {
    ReactNativeWebView: { postMessage: (data: string) => posted.push(JSON.parse(data)) },
    addEventListener: (type: string, fn: Listener) => { (listeners[type] = listeners[type] || []).push(fn); },
    dispatchEvent: (event: { type: string; detail?: unknown }) => { events.push(event); (listeners[event.type] || []).forEach((fn) => fn(event)); return true; }
  };
  class FakeEvent { type: string; detail?: unknown; constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail; } }
  const run = (script: string) => new Function("window", "CustomEvent", "Event", script)(win, FakeEvent, FakeEvent);
  return { win, posted, events, run };
}

describe("injected EIP-1193 provider", () => {
  it("exposes window.ethereum, announces via EIP-6963 and round-trips requests", async () => {
    const { win, posted, events, run } = makeWindow();
    run(buildProviderScript("uuid-1"));
    expect(win.ethereum.isTrex).toBe(true);
    expect(win.ethereum.isMetaMask).toBe(false);
    const announce = events.find((e) => e.type === "eip6963:announceProvider");
    expect(announce?.detail.info).toMatchObject({ uuid: "uuid-1", name: "TREX Wallet", rdns: "com.trexwallet.app" });
    expect(announce?.detail.provider).toBe(win.ethereum);

    // Re-announces when a dApp asks.
    win.dispatchEvent({ type: "eip6963:requestProvider" });
    expect(events.filter((e) => e.type === "eip6963:announceProvider")).toHaveLength(2);

    // Initial chain probe.
    expect(posted[0]).toMatchObject({ __trex: 1, method: "eth_chainId" });
    run(buildReceiveScript({ id: posted[0].id, method: "eth_chainId", result: "0x14a34" }));
    expect(win.ethereum.chainId).toBe("0x14a34");

    const accounts = win.ethereum.request({ method: "eth_requestAccounts" });
    const sent = posted[posted.length - 1];
    run(buildReceiveScript({ id: sent.id, method: "eth_requestAccounts", result: ["0xabc"] }));
    await expect(accounts).resolves.toEqual(["0xabc"]);
    expect(win.ethereum.selectedAddress).toBe("0xabc");
  });

  it("rejects with the wallet's error code and emits events", async () => {
    const { win, posted, run } = makeWindow();
    run(buildProviderScript("uuid-2"));
    const changes: unknown[] = [];
    win.ethereum.on("accountsChanged", (a: unknown) => changes.push(a));
    win.ethereum.on("chainChanged", (c: unknown) => changes.push(c));
    const signing = win.ethereum.request({ method: "personal_sign", params: ["0x00", "0xabc"] });
    const sent = posted[posted.length - 1];
    run(buildReceiveScript({ id: sent.id, error: { code: 4001, message: "rejected" } }));
    await expect(signing).rejects.toMatchObject({ code: 4001, message: "rejected" });
    run(buildReceiveScript({ event: "accountsChanged", data: [] }));
    run(buildReceiveScript({ event: "chainChanged", data: "0xaa36a7" }));
    expect(changes).toEqual([[], "0xaa36a7"]);
    expect(win.ethereum.networkVersion).toBe("11155111");
    await expect(win.ethereum.request(null)).rejects.toMatchObject({ code: -32602 });
  });

  it("does not inject twice", () => {
    const { win, run } = makeWindow();
    run(buildProviderScript("a"));
    const first = win.ethereum;
    run(buildProviderScript("b"));
    expect(win.ethereum).toBe(first);
  });
});
