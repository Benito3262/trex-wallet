import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { loadWallet } from "../wallet/vault";
import { theme } from "../theme";

export function WalletUnlock({ onUnlocked, onRestore }: { onUnlocked: (address: string) => void; onRestore: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function unlock() {
    setBusy(true);
    setError("");
    try {
      const wallet = await loadWallet();
      if (!wallet) {
        setError("No protected wallet was found. Restore it with your recovery phrase.");
        return;
      }
      onUnlocked(wallet.address);
    } catch {
      setError("Wallet could not be unlocked. Authenticate again or restore from your offline recovery phrase.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Wallet protected</Text>
      <Text style={styles.body}>Your recovery phrase is encrypted in device secure storage. Authenticate to unlock this wallet on this device.</Text>
      <Pressable onPress={unlock} disabled={busy} style={styles.button}>
        <Text style={styles.buttonText}>{busy ? "WAITING FOR AUTHENTICATION..." : "UNLOCK WALLET"}</Text>
      </Pressable>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!error && <Pressable onPress={onRestore} style={styles.restoreButton}><Text style={styles.restoreText}>RESTORE WITH RECOVERY PHRASE</Text></Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, padding: 17, marginTop: 18 },
  title: { color: theme.colors.text, fontSize: 14, fontWeight: "800" },
  body: { color: theme.colors.muted, fontSize: 11, lineHeight: 18, marginTop: 7, marginBottom: 14 },
  button: { backgroundColor: theme.colors.primary, borderRadius: 12, padding: 13, alignItems: "center" },
  buttonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  error: { color: theme.colors.danger, fontSize: 10, marginTop: 10 },
  restoreButton: { alignItems: "center", paddingVertical: 12 },
  restoreText: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 0.7 }
});
