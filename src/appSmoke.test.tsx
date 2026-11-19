/**
 * Startup smoke test: evaluates the real App module graph (polyfills, ethers, WalletKit,
 * screens) and renders the first screen with native modules mocked. Catches module-load
 * and first-render crashes before they reach a phone.
 */
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";

jest.mock("@react-native-async-storage/async-storage", () => require("@react-native-async-storage/async-storage/jest/async-storage-mock"));
jest.mock("@react-native-community/netinfo", () => require("@react-native-community/netinfo/jest/netinfo-mock.js"));
jest.mock("react-native-webview", () => {
  const { View } = require("react-native");
  return { WebView: View, default: View };
});
jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(async () => ({
    execAsync: jest.fn(async () => undefined),
    runAsync: jest.fn(async () => ({ changes: 0, lastInsertRowId: 0 })),
    getAllAsync: jest.fn(async () => []),
    getFirstAsync: jest.fn(async () => null),
    withTransactionAsync: jest.fn(async (fn: () => Promise<void>) => fn())
  }))
}));
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
  isAvailableAsync: jest.fn(async () => true),
  canUseBiometricAuthentication: jest.fn(() => true),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1
}));
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: false })),
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
  getEnrolledLevelAsync: jest.fn(async () => 3)
}));
jest.mock("expo-screen-capture", () => ({ usePreventScreenCapture: jest.fn(), preventScreenCaptureAsync: jest.fn(async () => undefined), allowScreenCaptureAsync: jest.fn(async () => undefined) }));
jest.mock("expo-camera", () => ({ CameraView: () => null, useCameraPermissions: () => [null, jest.fn(async () => ({ granted: false })), jest.fn()] }));

function allText(renderer: TestRenderer.ReactTestRenderer): string {
  return renderer.root.findAllByType(Text).map((node) => [].concat(node.props.children).join("")).join(" ");
}

describe("app startup", () => {
  it("loads the entry graph and renders onboarding for a fresh install", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const { createRoot } = require("./crash/Root");
    const { getCrash } = require("./crash/crashStore");
    const Root = createRoot(() => require("../App"));
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => { renderer = TestRenderer.create(<Root />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    spy.mockRestore();
    expect(getCrash()).toBeNull();
    const text = allText(renderer);
    if (process.env.SMOKE_DEBUG) console.log(text.slice(0, 400));
    expect(text).not.toContain("TREX hit an error");
    expect(text).not.toContain("Something went wrong");
    expect(text).toContain("Create wallet");
    act(() => renderer.unmount());
  }, 120_000); // a cold CI cache transforms the whole graph (WalletKit, ethers, navigation) first
});
