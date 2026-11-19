import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { loadWallet } from "../wallet/vault";
import { theme } from "../theme";

export function WalletUnlock({ onUnlocked, onRestore }: { onUnlocked: (address: string) => void; onRestore: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function unlock() {
    if (busy) return;
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
      setError("Authentication was cancelled or the wallet could not be unlocked. Try again or restore your wallet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <View style={styles.logo}><Text style={styles.logoText}>T</Text></View>
        <Text style={styles.brand}>TREX<Text style={styles.dot}>.</Text></Text>
        <Text style={styles.caption}>YOUR EVM WALLET</Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.lockCircle}><Text style={styles.lock}>⌑</Text></View>
        <Text style={styles.kicker}>WELCOME BACK</Text>
        <Text style={styles.title}>Your wallet, protected.</Text>
        <Text style={styles.body}>Sign in securely on this device to access your assets and continue where you left off.</Text>
        <Pressable accessibilityRole="button" onPress={unlock} disabled={busy} style={({ pressed }) => [styles.primary, pressed && !busy && styles.pressed, busy && styles.busy]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Sign in securely</Text>}
        </Pressable>
        <Text style={styles.secureNote}>BIOMETRIC AUTHENTICATION · KEYS STAY ON YOUR DEVICE</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </View>

      <View style={styles.bottom}>
        <Pressable onPress={onRestore} style={styles.restore}><Text style={styles.restoreText}>Restore with recovery phrase</Text></Pressable>
        <Text style={styles.footer}>Never share your recovery phrase with anyone.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background, paddingHorizontal: 25, justifyContent: "space-between", paddingTop: 54, paddingBottom: 24 },
  top: { alignItems: "center" },
  logo: { width: 66, height: 66, borderRadius: 22, backgroundColor: "#32190B", borderWidth: 1, borderColor: "#D97719", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#FFE4BD", fontSize: 42, fontWeight: "900" },
  brand: { color: theme.colors.text, fontSize: 29, fontWeight: "900", letterSpacing: 4, marginTop: 12 },
  dot: { color: theme.colors.primaryBright },
  caption: { color: theme.colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 2.4, marginTop: 1 },
  panel: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 26, padding: 23 },
  lockCircle: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#3A1D0C", alignItems: "center", justifyContent: "center", marginBottom: 22 },
  lock: { color: theme.colors.primaryBright, fontSize: 27, fontWeight: "700" },
  kicker: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1.8, marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 25, fontWeight: "900", letterSpacing: -0.5 },
  body: { color: theme.colors.muted, fontSize: 12, lineHeight: 20, marginTop: 10, marginBottom: 23 },
  primary: { minHeight: 52, backgroundColor: theme.colors.primary, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
  pressed: { opacity: 0.8 },
  busy: { opacity: 0.75 },
  secureNote: { color: theme.colors.muted, fontSize: 8, letterSpacing: 0.8, textAlign: "center", marginTop: 15 },
  error: { color: theme.colors.danger, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 14 },
  bottom: { alignItems: "center", gap: 13 },
  restore: { padding: 12 },
  restoreText: { color: theme.colors.primaryBright, fontSize: 12, fontWeight: "800" },
  footer: { color: theme.colors.muted, fontSize: 9 }
});
