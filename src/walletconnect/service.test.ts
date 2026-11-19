/** WalletConnect service lifecycle with WalletKit mocked: expiry, timeouts and disconnects close reviews. */
import { EventEmitter } from "events";

const mockKitEvents = new EventEmitter();
const mockSignEvents = new EventEmitter();
const mockSessions: Record<string, unknown> = {};
const mockResponses: { topic: string; response: { id: number; error?: { code: number; message: string }; result?: unknown } }[] = [];

jest.mock("@walletconnect/core", () => ({ Core: jest.fn() }));
jest.mock("@reown/walletkit", () => ({
  WalletKit: {
    init: jest.fn(async () => ({
      on: (event: string, fn: (...args: unknown[]) => void) => mockKitEvents.on(event, fn),
      engine: { signClient: { events: mockSignEvents } },
      getActiveSessions: () => mockSessions,
      respondSessionRequest: jest.fn(async (args) => { mockResponses.push(args); }),
      disconnectSession: jest.fn(async () => undefined),
      rejectSessionAuthenticate: jest.fn(async () => undefined),
      updateSession: jest.fn(async () => undefined),
      emitSessionEvent: jest.fn(async () => undefined)
    }))
  }
}));
jest.mock("../dapp/session", () => ({
  connectOrigin: jest.fn(async () => undefined),
  disconnectOrigin: jest.fn(async () => undefined),
  createRequestContext: (peer: unknown) => ({ peer })
}));
jest.mock("../dapp/router", () => {
  const { approvalQueue } = jest.requireActual("../dapp/approvalCenter");
  return {
    toHexChainId: (id: number) => `0x${id.toString(16)}`,
    routeRequest: (ctx: { peer: unknown }) => approvalQueue.ask({ type: "sign", peer: ctx.peer, request: { kind: "personal_sign" }, chainId: 84532 })
  };
});

const TOPIC = "topic-1";
mockSessions[TOPIC] = { topic: TOPIC, expiry: 0, namespaces: {}, peer: { metadata: { name: "Test dApp", url: "https://dapp.example", icons: [] } } };

function request(id: number, expiryTimestamp?: number) {
  mockKitEvents.emit("session_request", { topic: TOPIC, id, params: { chainId: "eip155:84532", request: { method: "personal_sign", params: ["0x00", "0x0"], expiryTimestamp } } });
}
const flush = () => new Promise((resolve) => jest.requireActual<typeof import("timers")>("timers").setImmediate(resolve));

describe("WalletConnect service cleanup", () => {
  let approvalQueue: typeof import("../dapp/approvalCenter").approvalQueue;
  beforeAll(async () => {
    process.env.EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID = "test-project";
    const service = require("./service") as typeof import("./service");
    approvalQueue = (require("../dapp/approvalCenter") as typeof import("../dapp/approvalCenter")).approvalQueue;
    await service.initWalletConnect();
  });
  beforeEach(() => { mockResponses.length = 0; approvalQueue.cancelAll(); });
  afterAll(async () => { approvalQueue.cancelAll(); await flush(); });

  it("closes the review and answers the dApp when the relay reports expiry", async () => {
    request(11);
    await flush();
    expect(approvalQueue.head()?.peer).toMatchObject({ wcTopic: TOPIC, wcRequestId: 11 });
    mockKitEvents.emit("session_request_expire", { id: 11 });
    await flush();
    expect(approvalQueue.size()).toBe(0);
    expect(mockResponses[0].response).toMatchObject({ id: 11, error: { code: -32002 } });
  });

  it("closes the review when the request's own lifetime runs out", async () => {
    jest.useFakeTimers();
    try {
      request(12, Math.floor(Date.now() / 1000) + 60);
      await Promise.resolve();
      await Promise.resolve();
      expect(approvalQueue.size()).toBe(1);
      jest.advanceTimersByTime(61_000);
    } finally {
      jest.useRealTimers();
    }
    await flush();
    expect(approvalQueue.size()).toBe(0);
    expect(mockResponses[0].response.error?.message).toMatch(/expired/);
  });

  it("closes every review for a session that is deleted or expires", async () => {
    request(13);
    request(14);
    await flush();
    expect(approvalQueue.size()).toBe(2);
    mockKitEvents.emit("session_delete", { topic: TOPIC, id: 1 });
    await flush();
    expect(approvalQueue.size()).toBe(0);
    expect(mockResponses.map((r) => r.response.error?.code)).toEqual([4900, 4900]);

    request(15);
    await flush();
    mockSignEvents.emit("session_expire", { topic: TOPIC });
    await flush();
    expect(approvalQueue.size()).toBe(0);
  });

  it("leaves other mockSessions' reviews alone", async () => {
    request(16);
    await flush();
    mockKitEvents.emit("session_request_expire", { id: 999 });
    mockSignEvents.emit("session_expire", { topic: "other" });
    await flush();
    expect(approvalQueue.size()).toBe(1);
  });
});
