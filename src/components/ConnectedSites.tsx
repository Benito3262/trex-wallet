import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { connectionList, disconnectOrigin, subscribeConnections } from "../dapp/session";
import type { Connection } from "../wallet/localStore";
import { theme } from "../theme";
import { FadeIn, SpringPressable } from "./motion";

/** Sites (browser and WalletConnect) connected to the active account, with disconnect. */
export function ConnectedSites({ address, onBack, onDisconnectWalletConnect }: { address: string; onBack: () => void; onDisconnectWalletConnect?: (origin: string) => Promise<void> }) {
  const [items, setItems] = useState<Connection[] | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    connectionList(address).then(setItems).catch(() => { setItems([]); setError("Could not load connected sites."); });
  }, [address]);
  useEffect(() => { load(); return subscribeConnections(load); }, [load]);

  async function disconnect(item: Connection) {
    try {
      if (item.source === "walletconnect") await onDisconnectWalletConnect?.(item.origin);
      await disconnectOrigin(item.origin, item.address);
    } catch {
      setError("Disconnect failed. Try again.");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack}><Text style={styles.back}>‹ BACK</Text></Pressable>
      <Text style={styles.kicker}>PRIVACY</Text>
      <Text style={styles.title}>Connected sites</Text>
      <Text style={styles.intro}>These sites can see this account's address and ask for signatures. Disconnecting stops that until you approve them again.</Text>
      {items === null && <ActivityIndicator color={theme.colors.primaryBright} style={{ marginTop: 20 }} />}
      {items?.length === 0 && <Text style={[styles.intro, { marginTop: 20 }]}>No sites are connected to this account.</Text>}
      {items?.map((item, index) => (
        <FadeIn key={`${item.origin}-${item.address}`} delay={index * 40} style={styles.card}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>{item.name || item.origin.replace(/^https?:\/\//, "")}</Text>
            <Text style={styles.meta} numberOfLines={1}>{item.origin} · {item.source === "walletconnect" ? "WalletConnect" : "Browser"}</Text>
            <Text style={styles.meta}>Since {new Date(item.connectedAt).toLocaleDateString()}</Text>
          </View>
          <SpringPressable style={styles.button} onPress={() => disconnect(item)}><Text style={styles.buttonText}>DISCONNECT</Text></SpringPressable>
        </FadeIn>
      ))}
      {!!error && <Text style={styles.error}>{error}</Text>}
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
  card: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, padding: 13, marginTop: 12 },
  name: { color: theme.colors.text, fontSize: 13, fontWeight: "800" },
  meta: { color: theme.colors.muted, fontSize: 10, marginTop: 3 },
  button: { borderColor: theme.colors.primary, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  buttonText: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  error: { color: theme.colors.danger, fontSize: 11, marginTop: 14 }
});
