import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { AnimatedPressable as Pressable } from "./AnimatedPressable";
import { haptic } from "./haptics";
import { authenticateWallet } from "../wallet/vault";
import { theme } from "../theme";
import { BrandLogo, Wordmark } from "./brand";
import { FadeIn } from "./motion";

export function WalletUnlock({ onUnlocked, onRestore }: { onUnlocked: (address: string) => void; onRestore: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function unlock() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      // Biometric gate only; no key derivation on unlock, so the app opens instantly after auth.
      const account = await authenticateWallet("Authenticate to unlock your TREX Wallet");
      haptic("success");
      onUnlocked(account.address);
    } catch {
      setError("Authentication was cancelled or the wallet could not be unlocked. Try again or restore your wallet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <BrandLogo size={116} />
        <View style={{ marginTop: 14 }}><Wordmark height={30} tagline /></View>
      </View>

      <FadeIn style={styles.panel}>
        <View style={styles.lockCircle}><Text style={styles.lock}>⌑</Text></View>
        <Text style={styles.kicker}>WELCOME BACK</Text>
        <Text style={styles.title}>Your wallet, protected.</Text>
        <Text style={styles.body}>Sign in securely on this device to access your assets and continue where you left off.</Text>
        <Pressable onPress={unlock} disabled={busy} haptic="medium" accessibilityState={{ busy }} style={[styles.primary, busy && styles.busy]}>
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Sign in securely</Text>}
        </Pressable>
        <Text style={styles.secureNote}>BIOMETRIC AUTHENTICATION · KEYS STAY ON YOUR DEVICE</Text>
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      </FadeIn>

      <View style={styles.bottom}>
        <Pressable onPress={onRestore} style={styles.restore}><Text style={styles.restoreText}>Restore with recovery phrase</Text></Pressable>
        <Text style={styles.footer}>Never share your recovery phrase with anyone.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background, paddingHorizontal: 25, justifyContent: "space-between", paddingTop: 34, paddingBottom: 24 },
  top: { alignItems: "center" },
  logo: { width: 66, height: 66, borderRadius: 22, backgroundColor: "#32190B", borderWidth: 1, borderColor: "#D97719", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#FFE4BD", fontSize: 42, fontWeight: "900" },
  brand: { color: theme.colors.text, fontSize: 29, fontWeight: "900", letterSpacing: 4, marginTop: 12 },
  dot: { color: theme.colors.primaryBright },
  caption: { color: theme.colors.muted, fontSize: 8, fontWeight: "800", letterSpacing: 2.4, marginTop: 1 },
  panel: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 26, padding: 23, shadowColor: theme.colors.primary, shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
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
