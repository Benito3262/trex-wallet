import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { clearCrash, getCrash, installGlobalErrorHandler, reportCrash, sanitize, toCrashInfo } from "./crashStore";
import { createRoot } from "./Root";

function allText(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root.findAllByType(Text).map((node) => [].concat(node.props.children).join("")).join("\n");
}

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => { act(() => { mounted.splice(0).forEach((r) => r.unmount()); }); clearCrash(); });

describe("crash store", () => {
  it("shows fatal global errors instead of passing them to the default (app-closing) handler", () => {
    let handler: ((e: unknown, fatal?: boolean) => void) | undefined;
    const previous = jest.fn();
    expect(installGlobalErrorHandler({ getGlobalHandler: () => previous, setGlobalHandler: (h) => { handler = h; } })).toBe(true);
    handler!(new TypeError("undefined is not a function"), true);
    expect(previous).not.toHaveBeenCalled();
    expect(getCrash()).toMatchObject({ message: "TypeError: undefined is not a function", source: "global" });
    handler!(new Error("minor"), false);
    expect(previous).toHaveBeenCalledTimes(1);
  });
  it("returns false when ErrorUtils is unavailable", () => {
    expect(installGlobalErrorHandler({})).toBe(false);
  });
  it("redacts anything that looks like a key or recovery phrase", () => {
    const key = "0x" + "ab".repeat(32);
    const phrase = "test test test test test test test test test test test junk";
    expect(sanitize(`bad key ${key} | ${phrase}`, 500)).toBe("bad key [redacted] | [redacted]");
    expect(toCrashInfo({ name: "RealmError", message: "cross-realm" }, "startup").message).toBe("RealmError: cross-realm");
    expect(sanitize("x".repeat(50), 10)).toHaveLength(10);
  });
});

describe("root crash screen", () => {
  it("shows the error when App fails while loading its modules", () => {
    const Root = createRoot(() => { throw new Error("Cannot read property 'Buffer' of undefined"); });
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<Root />); }); mounted.push(renderer);
    expect(allText(renderer)).toContain("TREX hit an error");
    expect(allText(renderer)).toContain("Cannot read property 'Buffer' of undefined");
    expect(allText(renderer)).toContain("STARTUP");
  });
  it("shows render errors and a later global fatal error", () => {
    function Boom(): React.ReactElement { throw new Error("render exploded"); }
    const Root = createRoot(() => ({ default: Boom }));
    let renderer!: TestRenderer.ReactTestRenderer;
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    act(() => { renderer = TestRenderer.create(<Root />); }); mounted.push(renderer);
    spy.mockRestore();
    expect(allText(renderer)).toContain("render exploded");
  });
  it("renders the app normally and switches to the crash screen on a fatal error", () => {
    const Root = createRoot(() => ({ default: () => <Text>wallet home</Text> }));
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<Root />); }); mounted.push(renderer);
    expect(allText(renderer)).toContain("wallet home");
    act(() => { reportCrash(new Error("late failure"), "global"); });
    expect(allText(renderer)).toContain("late failure");
  });
});
