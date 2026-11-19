import { AppLockPolicy, SYSTEM_DIALOG_GRACE_MS } from "./appLock";

describe("app lock policy", () => {
  it("locks immediately on a normal background", () => {
    const p = new AppLockPolicy();
    expect(p.onBackground(1000)).toBe(true);
    expect(p.onActive(2000)).toBe(false);
  });
  it("skips the lock for a quick system dialog opened by TREX", () => {
    const p = new AppLockPolicy();
    p.expectSystemDialog(0);
    expect(p.onBackground(100)).toBe(false);
    expect(p.onActive(5000)).toBe(false);
  });
  it("locks on return when the trip away was too long", () => {
    const p = new AppLockPolicy();
    p.expectSystemDialog(0);
    expect(p.onBackground(100)).toBe(false);
    expect(p.onActive(100 + SYSTEM_DIALOG_GRACE_MS + 1)).toBe(true);
  });
  it("grace is one-shot and expires", () => {
    const p = new AppLockPolicy();
    p.expectSystemDialog(0);
    p.onBackground(10);
    p.onActive(20);
    expect(p.onBackground(30)).toBe(true);
    const q = new AppLockPolicy();
    q.expectSystemDialog(0);
    expect(q.onBackground(SYSTEM_DIALOG_GRACE_MS + 1)).toBe(true);
  });
});
