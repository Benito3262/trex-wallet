import { ApprovalQueue } from "./approvalCenter";
import { ProviderRpcError } from "./errors";
import type { SignRequest } from "./router";

const sign = { kind: "personal_sign", address: "0x0", message: "hi" } as unknown as SignRequest;
const peer = (extra: object = {}) => ({ origin: "https://dapp.example", source: "walletconnect" as const, name: "dApp", ...extra });

describe("approval queue withdrawal", () => {
  it("cancels only matching WalletConnect requests and notifies listeners", async () => {
    const queue = new ApprovalQueue();
    const notices: string[] = [];
    queue.onCancelled((n) => notices.push(n.message));
    const a = queue.ask({ type: "sign", peer: peer({ wcTopic: "t1", wcRequestId: 1 }), request: sign, chainId: 84532 });
    const b = queue.ask({ type: "sign", peer: peer({ wcTopic: "t2", wcRequestId: 2 }), request: sign, chainId: 84532 });
    const count = queue.cancelWhere((item) => item.peer.wcRequestId === 1, new ProviderRpcError(-32002, "expired"));
    expect(count).toBe(1);
    await expect(a).rejects.toThrow("expired");
    expect(queue.size()).toBe(1);
    expect(notices).toEqual(["expired"]);
    queue.cancelAll();
    await expect(b).rejects.toBeTruthy();
  });

  it("assertPending throws once a request was withdrawn", async () => {
    const queue = new ApprovalQueue();
    const p = queue.ask({ type: "sign", peer: peer({ wcTopic: "t" }), request: sign, chainId: 1 });
    const id = queue.head()!.id;
    expect(() => queue.assertPending(id)).not.toThrow();
    queue.cancelWhere(() => true, new Error("gone"), false);
    await expect(p).rejects.toThrow("gone");
    expect(queue.isPending(id)).toBe(false);
    expect(() => queue.assertPending(id)).toThrow(/Nothing was signed/);
  });

  it("a withdrawn request can no longer be resolved", async () => {
    const queue = new ApprovalQueue();
    const p = queue.ask({ type: "sign", peer: peer(), request: sign, chainId: 1 });
    const head = queue.head()!;
    queue.cancelWhere(() => true, new Error("expired"), false);
    head.resolve("0xsig" as never);
    await expect(p).rejects.toThrow("expired");
  });
});
