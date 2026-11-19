import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { HDNodeWallet, Mnemonic } from "ethers";
import { usePreventScreenCapture } from "expo-screen-capture";
import { loadWallet } from "../wallet/vault";
import { theme } from "../theme";

export function WalletManager({ onBack }: { onBack: () => void }) {
  usePreventScreenCapture();
  const [address, setAddress] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setBusy(true);
    loadWallet().then((wallet) => {
      if (!active) return;
      if (!wallet) throw new Error("No wallet is stored on this device.");
      const derived = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(wallet.mnemonic), wallet.derivationPath);
      if (derived.address.toLowerCase() !== wallet.address.toLowerCase()) {
        throw new Error("Wallet integrity check failed. Private-key export has been stopped.");
      }
      setAddress(wallet.address);
      setPrivateKey(derived.privateKey);
    }).catch((error) => {
      if (active) setMessage(error instanceof Error ? error.message : "Could not unlock this wallet.");
    }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; setPrivateKey(""); };
  }, []);

  async function copy(value: string, label: string) {
    try {
      await Clipboard.setStringAsync(value);
      setMessage(`${label} copied. Treat clipboard contents as sensitive.`);
    } catch {
      setMessage("Could not copy to clipboard.");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={onBack}><Text style={styles.back}>‹ BACK TO WALLET</Text></Pressable>
      <Text style={styles.kicker}>ACCOUNT & SECURITY</Text>
      <Text style={styles.title}>Wallet management</Text>
      <Text style={styles.intro}>Your wallet keys remain on this device. TREX never uploads your recovery phrase or private key.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>ACTIVE ACCOUNT</Text>
        <Text selectable style={styles.address}>{address || (busy ? "Unlocking wallet…" : "Unavailable")}</Text>
        <Pressable style={styles.secondary} onPress={() => copy(address, "Wallet address")} disabled={!address}><Text style={styles.secondaryText}>COPY ADDRESS</Text></Pressable>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>PRIVATE KEY</Text>
        <Text style={styles.warning}>Anyone with this key can control your assets. Only reveal it in a private place. Never send it to support or paste it into websites.</Text>
        <View style={styles.keyBox}><Text selectable={revealed ? styles.key : styles.masked}>{revealed ? (privateKey || "Not available") : "•••• •••• •••• •••• •••• ••••"}</Text></View>
        <Pressable style={styles.primary} onPress={() => { setMessage(""); setRevealed((value) => !value); }} disabled={!privateKey || busy}><Text style={styles.primaryText}>{revealed ? "HIDE PRIVATE KEY" : "REVEAL PRIVATE KEY"}</Text></Pressable>
        {revealed && <Pressable style={styles.secondary} onPress={() => copy(privateKey, "Private key")}><Text style={styles.secondaryText}>COPY PRIVATE KEY</Text></Pressable>}
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>MORE ACCOUNTS</Text>
        <Text style={styles.intro}>Multiple imported wallets and account switching are not implemented in this build yet. This screen currently manages the one protected wallet stored on this device.</Text>
      </View>
      {!!message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
      <Text style={styles.footer}>PRIVATE KEY EXPORT REQUIRES DEVICE BIOMETRIC AUTHENTICATION</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 22, paddingBottom: 36 },
  back: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 28 },
  kicker: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1.7, marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: "900" },
  intro: { color: theme.colors.muted, fontSize: 11, lineHeight: 18, marginTop: 8 },
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 16 },
  label: { color: theme.colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginBottom: 10 },
  address: { color: theme.colors.text, fontSize: 11, lineHeight: 18 },
  warning: { color: theme.colors.warning, fontSize: 10, lineHeight: 17, marginBottom: 12 },
  keyBox: { backgroundColor: theme.colors.background, borderRadius: 12, padding: 13, minHeight: 50, justifyContent: "center" },
  key: { color: theme.colors.text, fontSize: 11, lineHeight: 18 },
  masked: { color: theme.colors.muted, fontSize: 14, letterSpacing: 2 },
  primary: { backgroundColor: theme.colors.primary, borderRadius: 12, alignItems: "center", padding: 13, marginTop: 13 },
  primaryText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  secondary: { borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, alignItems: "center", padding: 12, marginTop: 10 },
  secondaryText: { color: theme.colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  message: { color: theme.colors.primaryBright, fontSize: 10, lineHeight: 16, marginTop: 14 },
  footer: { color: theme.colors.muted, fontSize: 8, letterSpacing: 1, textAlign: "center", marginTop: 22 }
});
