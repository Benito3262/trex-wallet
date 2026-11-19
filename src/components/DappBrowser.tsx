import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import WebView from "react-native-webview";
import { hexlify, randomBytes } from "ethers";
import { theme } from "../theme";
import { buildProviderScript, buildReceiveScript } from "../dapp/providerScript";
import { assertSecureOrigin, originOf, parseBridgeMessage } from "../dapp/browserBridge";
import { routeRequest, toHexChainId, type RequestContext } from "../dapp/router";
import { toRpcError } from "../dapp/errors";
import { createRequestContext, disconnectOrigin, isOriginConnected, loadConnections, subscribeConnections } from "../dapp/session";
import { approvalQueue } from "../dapp/approvalCenter";
import { getWalletState, hasWalletState, subscribeWalletState } from "../dapp/walletState";

const BrowserWebView = WebView as unknown as React.ComponentType<any>;
type BrowserNavigation = { url: string; canGoBack: boolean; canGoForward: boolean };
type BrowserHandle = { reload: () => void; goBack: () => void; goForward: () => void; injectJavaScript: (script: string) => void };
type BrowserMessageEvent = { nativeEvent: { data: string; url: string } };

// One EIP-6963 uuid per app run, as the spec recommends.
const PROVIDER_UUID = (() => {
  const hex = hexlify(randomBytes(16)).slice(2);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
})();

const HOME = "https://www.google.com";

function normalizeUrl(input: string): string {
  const value = input.trim();
  if (!value) throw new Error("Enter a website address.");
  if (/^(javascript|data|file|intent):/i.test(value)) throw new Error("This address type is blocked.");
  const candidate = /^https?:\/\//i.test(value) ? value : /^localhost(?::\d+)?/i.test(value) ? `http://${value}` : `https://${value}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("Only web addresses are supported.");
  return parsed.toString();
}

export function DappBrowser({ onClose }: { onClose: () => void }) {
  const web = useRef<BrowserHandle | null>(null);
  const [url, setUrl] = useState(HOME);
  const [input, setInput] = useState(HOME);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [error, setError] = useState("");
  const [connectedHere, setConnectedHere] = useState(false);
  const currentOrigin = useRef<string | null>(originOf(HOME));
  const contexts = useRef(new Map<string, RequestContext>());
  const providerScript = useMemo(() => buildProviderScript(PROVIDER_UUID), []);

  const post = useCallback((origin: string, message: unknown) => {
    // Never deliver a response to a different site than the one that asked.
    if (currentOrigin.current !== origin) return;
    try { web.current?.injectJavaScript(buildReceiveScript(message)); } catch { /* page gone */ }
  }, []);

  const refreshConnected = useCallback(() => {
    const origin = currentOrigin.current;
    const address = hasWalletState() ? getWalletState().address : null;
    setConnectedHere(!!origin && isOriginConnected(origin, address));
  }, []);

  useEffect(() => {
    loadConnections().then(refreshConnected).catch(() => undefined);
    const offConnections = subscribeConnections(() => {
      refreshConnected();
      const origin = currentOrigin.current;
      if (!origin || !hasWalletState()) return;
      const { address } = getWalletState();
      post(origin, { event: "accountsChanged", data: address && isOriginConnected(origin, address) ? [address] : [] });
    });
    const offState = subscribeWalletState((next, previous) => {
      const origin = currentOrigin.current;
      refreshConnected();
      if (!origin) return;
      if (next.network.chainId !== previous.network.chainId) post(origin, { event: "chainChanged", data: toHexChainId(next.network.chainId) });
      if (next.address !== previous.address) post(origin, { event: "accountsChanged", data: next.address && isOriginConnected(origin, next.address) ? [next.address] : [] });
    });
    return () => {
      offConnections();
      offState();
      const origin = currentOrigin.current;
      if (origin) approvalQueue.cancelOrigin(origin);
    };
  }, [post, refreshConnected]);

  function contextFor(origin: string): RequestContext {
    let context = contexts.current.get(origin);
    if (!context) {
      context = createRequestContext({ origin, source: "browser" });
      contexts.current.set(origin, context);
    }
    return context;
  }

  function onMessage(event: BrowserMessageEvent) {
    const message = parseBridgeMessage(event.nativeEvent.data);
    const origin = originOf(event.nativeEvent.url);
    if (!message || !origin) return;
    const reply = (payload: Record<string, unknown>) => post(origin, { id: message.id, method: message.method, ...payload });
    (async () => {
      assertSecureOrigin(origin);
      return routeRequest(contextFor(origin), message.method, message.params);
    })().then((result) => reply({ result: result ?? null }), (e) => reply({ error: toRpcError(e) }));
  }

  function navigate() {
    try {
      const next = normalizeUrl(input);
      setError("");
      setUrl(next);
      Keyboard.dismiss();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid website address.");
    }
  }

  function onNavigation(state: BrowserNavigation) {
    const nextOrigin = originOf(state.url);
    if (nextOrigin !== currentOrigin.current) {
      // Pending prompts belong to the page that asked; drop them when the site changes.
      if (currentOrigin.current) approvalQueue.cancelOrigin(currentOrigin.current);
      currentOrigin.current = nextOrigin;
      refreshConnected();
    }
    setUrl(state.url);
    setInput(state.url);
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.back}><Text style={styles.backText}>‹ WALLET</Text></Pressable>
        <View style={styles.titleWrap}><Text style={styles.title}>TREX BROWSER</Text><Text style={[styles.subtitle, connectedHere && { color: theme.colors.success }]}>{connectedHere ? "● SITE CONNECTED" : "YOUR WEB3 WALLET"}</Text></View>
        <Pressable onPress={() => web.current?.reload()} style={styles.reload}><Text style={styles.reloadText}>↻</Text></Pressable>
      </View>
      <View style={styles.addressBar}>
        <Text style={styles.lock}>⌑</Text>
        <TextInput value={input} onChangeText={setInput} onSubmitEditing={navigate} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" placeholder="Search or enter website" placeholderTextColor={theme.colors.muted} style={styles.addressInput}/>
        <Pressable onPress={navigate} style={styles.go}><Text style={styles.goText}>GO</Text></Pressable>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.securityNotice}>
        <Text style={[styles.noticeText, { flex: 1 }]}>{connectedHere ? "Connected. Every signature and transaction opens a TREX review first." : "Sites can ask to connect; nothing is signed without your review and biometrics. Never enter your recovery phrase on a website."}</Text>
        {connectedHere && currentOrigin.current && (
          <Pressable onPress={() => { const origin = currentOrigin.current; if (origin) disconnectOrigin(origin).catch(() => undefined); }} style={styles.disconnect}>
            <Text style={styles.disconnectText}>DISCONNECT</Text>
          </Pressable>
        )}
      </View>
      <View style={styles.webArea}>
        {loading && <View style={styles.loading}><ActivityIndicator color={theme.colors.primaryBright}/><Text style={styles.loadingText}>Loading website…</Text></View>}
        <BrowserWebView
          ref={web}
          source={{ uri: url }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={onNavigation}
          onError={() => { setLoading(false); setError("This website could not be loaded."); }}
          injectedJavaScriptBeforeContentLoaded={providerScript}
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly
          onMessage={onMessage}
          onContentProcessDidTerminate={() => web.current?.reload()}
          onRenderProcessGone={() => { setError("The page stopped responding and was reloaded."); web.current?.reload(); }}
          onShouldStartLoadWithRequest={(request: { url: string }) => request.url.startsWith("https://") || request.url.startsWith("http://")}
          javaScriptEnabled
          domStorageEnabled
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          mixedContentMode="never"
          originWhitelist={["https://*", "http://*"]}
        />
      </View>
      <View style={styles.toolbar}>
        <Pressable disabled={!canGoBack} onPress={() => web.current?.goBack()}><Text style={[styles.tool, !canGoBack && styles.disabled]}>‹</Text></Pressable>
        <Pressable disabled={!canGoForward} onPress={() => web.current?.goForward()}><Text style={[styles.tool, !canGoForward && styles.disabled]}>›</Text></Pressable>
        <Pressable onPress={() => { setInput(HOME); setUrl(HOME); setError(""); }}><Text style={styles.tool}>⌂</Text></Pressable>
        <Text style={styles.toolbarLabel}>TREX · WEB3 BROWSER</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  back: { minWidth: 65 }, backText: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900" },
  titleWrap: { alignItems: "center" }, title: { color: theme.colors.text, fontSize: 13, fontWeight: "900", letterSpacing: 1.5 }, subtitle: { color: theme.colors.muted, fontSize: 7, letterSpacing: 1.7, marginTop: 3 },
  reload: { minWidth: 34, alignItems: "flex-end" }, reloadText: { color: theme.colors.primaryBright, fontSize: 24 },
  addressBar: { flexDirection: "row", alignItems: "center", gap: 8, margin: 12, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, minHeight: 46 },
  lock: { color: theme.colors.primaryBright, fontSize: 17 }, addressInput: { flex: 1, color: theme.colors.text, fontSize: 11, paddingVertical: 9 }, go: { backgroundColor: theme.colors.primary, borderRadius: 9, paddingHorizontal: 13, paddingVertical: 8 }, goText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900" },
  error: { color: theme.colors.danger, fontSize: 10, paddingHorizontal: 14, paddingBottom: 8 },
  securityNotice: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.colors.surfaceRaised, borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 13, paddingVertical: 8 },
  disconnect: { borderColor: theme.colors.primary, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }, disconnectText: { color: theme.colors.primaryBright, fontSize: 8, fontWeight: "900", letterSpacing: 0.8 }, noticeText: { color: theme.colors.warning, fontSize: 9, lineHeight: 14 },
  webArea: { flex: 1, overflow: "hidden" }, loading: { position: "absolute", zIndex: 2, top: 12, alignSelf: "center", flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: 20, padding: 9 }, loadingText: { color: theme.colors.text, fontSize: 9 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: 11, borderTopWidth: 1, borderTopColor: theme.colors.border }, tool: { color: theme.colors.primaryBright, fontSize: 24, paddingHorizontal: 12 }, disabled: { opacity: 0.25 }, toolbarLabel: { color: theme.colors.muted, fontSize: 8, letterSpacing: 1 }
});
