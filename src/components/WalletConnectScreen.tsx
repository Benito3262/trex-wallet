import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { disconnectSession, getWcState, initWalletConnect, pair, subscribeWc, type WcState } from "../walletconnect/service";
import { theme } from "../theme";
import { FadeIn, SpringPressable } from "./motion";

/** Pair with dApps by pasting a wc: link, and manage active WalletConnect sessions. */
export function WalletConnectScreen({ onBack, initialUri }: { onBack: () => void; initialUri?: string | null }) {
  const [wc, setWc] = useState<WcState>(getWcState());
  const [uri, setUri] = useState(initialUri ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeWc(setWc), []);
  useEffect(() => { if (wc.status === "idle") initWalletConnect().catch(() => undefined); }, [wc.status]);
  useEffect(() => { if (initialUri) void connect(initialUri); }, [initialUri]); // eslint-disable-line react-hooks/exhaustive-deps

  async function connect(value = uri) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await pair(value);
      setUri("");
    } catch {
      // The service publishes a user-facing message in wc.error.
    } finally {
      setBusy(false);
    }
  }

  async function pasteFromClipboard() {
    try {
      const text = await Clipboard.getStringAsync();
      setUri(text.trim());
    } catch {
      setError("Could not read the clipboard.");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack}><Text style={styles.back}>‹ BACK</Text></Pressable>
      <FadeIn>
        <Text style={styles.kicker}>WALLETCONNECT</Text>
        <Text style={styles.title}>Connect a dApp</Text>
        <Text style={styles.intro}>On the site, choose WalletConnect, then "Copy link" (or copy the QR link) and paste it here. Every request still opens a TREX review.</Text>
      </FadeIn>

      {wc.status === "missing-project-id" ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>WalletConnect needs a project ID</Text>
          <Text style={styles.noticeText}>This build was made without EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID, so WalletConnect is turned off. The in-app browser still works.</Text>
        </View>
      ) : (
        <>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: wc.status === "ready" ? theme.colors.success : wc.status === "error" ? theme.colors.danger : theme.colors.warning }]} />
            <Text style={styles.statusText}>{wc.status === "ready" ? "Relay connected" : wc.status === "error" ? "WalletConnect failed to start" : "Starting WalletConnect…"}</Text>
            {wc.status === "error" && <Pressable onPress={() => initWalletConnect().catch(() => undefined)}><Text style={styles.link}>RETRY</Text></Pressable>}
          </View>
          <TextInput
            value={uri}
            onChangeText={setUri}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="wc:…@2?relay-protocol=irn&symKey=…"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            multiline
          />
          <View style={styles.row}>
            <Pressable style={styles.secondary} onPress={pasteFromClipboard}><Text style={styles.secondaryText}>PASTE</Text></Pressable>
            <SpringPressable containerStyle={{ flex: 1 }} style={styles.primary} onPress={() => connect()} disabled={busy || wc.pairing || !uri.trim() || wc.status === "error"}>
              {busy || wc.pairing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>CONNECT</Text>}
            </SpringPressable>
          </View>
          {wc.pairing && <Text style={styles.intro}>Waiting for the site to send its connection request…</Text>}
        </>
      )}
      {!!(wc.error || error) && <Text style={styles.error}>{wc.error || error}</Text>}

      <Text style={[styles.kicker, { marginTop: 26 }]}>ACTIVE SESSIONS</Text>
      {wc.sessions.length === 0 && <Text style={styles.intro}>No WalletConnect sessions.</Text>}
      {wc.sessions.map((session, index) => (
        <FadeIn key={session.topic} delay={index * 40} style={styles.card}>
          {session.icon?.startsWith("https://") ? <Image source={{ uri: session.icon }} style={styles.icon} /> : <View style={styles.icon} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{session.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>{session.url}</Text>
            <Text style={styles.meta}>Expires {new Date(session.expiry * 1000).toLocaleDateString()}</Text>
          </View>
          <Pressable style={styles.secondary} onPress={() => disconnectSession(session.topic).catch(() => undefined)}><Text style={styles.secondaryText}>DISCONNECT</Text></Pressable>
        </FadeIn>
      ))}
      <Text style={styles.footnote}>QR scanning is not built yet; use the site's copy-link option. Mainnet requests can connect but cannot be signed in this test build.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 22, paddingBottom: 40 },
  back: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 24 },
  kicker: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1.6, marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: "900" },
  intro: { color: theme.colors.muted, fontSize: 11, lineHeight: 18, marginTop: 8 },
  notice: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.warning, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 18 },
  noticeTitle: { color: theme.colors.warning, fontSize: 12, fontWeight: "900", marginBottom: 6 },
  noticeText: { color: theme.colors.muted, fontSize: 11, lineHeight: 17 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { color: theme.colors.text, fontSize: 11, flex: 1 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, backgroundColor: theme.colors.surface, color: theme.colors.text, padding: 12, fontSize: 12, minHeight: 80, textAlignVertical: "top", marginTop: 12 },
  row: { flexDirection: "row", gap: 10, marginTop: 12, alignItems: "center" },
  primary: { backgroundColor: theme.colors.primary, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingVertical: 14, minHeight: 48 },
  primaryText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  secondary: { borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, alignItems: "center" },
  secondaryText: { color: theme.colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  link: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  error: { color: theme.colors.danger, fontSize: 11, lineHeight: 17, marginTop: 12 },
  card: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 12, marginTop: 10 },
  icon: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.colors.surfaceRaised },
  name: { color: theme.colors.text, fontSize: 13, fontWeight: "800" },
  meta: { color: theme.colors.muted, fontSize: 10, marginTop: 2 },
  footnote: { color: "#8F6B4B", fontSize: 9, lineHeight: 14, marginTop: 22 }
});
