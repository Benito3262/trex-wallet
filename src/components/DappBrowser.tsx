import React, { useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { theme } from "../theme";

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
  const web = useRef<WebView>(null);
  const [url, setUrl] = useState(HOME);
  const [input, setInput] = useState(HOME);
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [error, setError] = useState("");

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

  function onNavigation(state: WebViewNavigation) {
    setUrl(state.url);
    setInput(state.url);
    setCanGoBack(state.canGoBack);
    setCanGoForward(state.canGoForward);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.back}><Text style={styles.backText}>‹ WALLET</Text></Pressable>
        <View style={styles.titleWrap}><Text style={styles.title}>TREX BROWSER</Text><Text style={styles.subtitle}>EXPLORE THE WEB3</Text></View>
        <Pressable onPress={() => web.current?.reload()} style={styles.reload}><Text style={styles.reloadText}>↻</Text></Pressable>
      </View>
      <View style={styles.addressBar}>
        <Text style={styles.lock}>⌑</Text>
        <TextInput value={input} onChangeText={setInput} onSubmitEditing={navigate} autoCapitalize="none" autoCorrect={false} keyboardType="url" returnKeyType="go" placeholder="Search or enter website" placeholderTextColor={theme.colors.muted} style={styles.addressInput}/>
        <Pressable onPress={navigate} style={styles.go}><Text style={styles.goText}>GO</Text></Pressable>
      </View>
      {!!error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.securityNotice}><Text style={styles.noticeText}>Browsing only. Wallet signing and dApp connections are not enabled yet. Never enter your recovery phrase on a website.</Text></View>
      <View style={styles.webArea}>
        {loading && <View style={styles.loading}><ActivityIndicator color={theme.colors.primaryBright}/><Text style={styles.loadingText}>Loading website…</Text></View>}
        <WebView
          ref={web}
          source={{ uri: url }}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onNavigationStateChange={onNavigation}
          onError={() => { setLoading(false); setError("This website could not be loaded."); }}
          onShouldStartLoadWithRequest={(request) => request.url.startsWith("https://") || request.url.startsWith("http://")}
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
  securityNotice: { backgroundColor: "#2A160B", borderTopWidth: 1, borderBottomWidth: 1, borderColor: theme.colors.border, paddingHorizontal: 13, paddingVertical: 8 }, noticeText: { color: theme.colors.warning, fontSize: 9, lineHeight: 14 },
  webArea: { flex: 1, overflow: "hidden" }, loading: { position: "absolute", zIndex: 2, top: 12, alignSelf: "center", flexDirection: "row", gap: 8, alignItems: "center", backgroundColor: theme.colors.surface, borderRadius: 20, padding: 9 }, loadingText: { color: theme.colors.text, fontSize: 9 },
  toolbar: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: 11, borderTopWidth: 1, borderTopColor: theme.colors.border }, tool: { color: theme.colors.primaryBright, fontSize: 24, paddingHorizontal: 12 }, disabled: { opacity: 0.25 }, toolbarLabel: { color: theme.colors.muted, fontSize: 8, letterSpacing: 1 }
});
