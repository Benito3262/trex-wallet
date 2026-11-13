import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import type { EvmNetwork } from "../config/networks";
import { theme } from "../theme";

export function ReceiveAddress({ address, network, onBack }: {
  address: string;
  network: EvmNetwork;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    await Clipboard.setStringAsync(address);
    setCopied(true);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ BACK</Text></Pressable>
        <Text style={styles.heading}>Receive assets</Text>
        <View style={{ width: 52 }} />
      </View>
      <Text style={styles.body}>Only send assets on a network supported by this address. Sending on the wrong network may result in permanent loss.</Text>
      <View style={styles.qrCard}>
        <View style={styles.qrFrame}>
          <QRCode value={address} size={190} backgroundColor="#FFFFFF" color="#090812" />
        </View>
        <Text style={styles.network}>{network.name} · Chain {network.chainId}</Text>
        <Text selectable style={styles.address}>{address}</Text>
        <Pressable style={styles.copyButton} onPress={copyAddress}>
          <Text style={styles.copyText}>{copied ? "ADDRESS COPIED" : "COPY ADDRESS"}</Text>
        </Pressable>
      </View>
      <View style={styles.warning}>
        <Text style={styles.warningTitle}>Check before sending</Text>
        <Text style={styles.warningText}>This is your public receiving address. Never share your recovery phrase or private key. TREX will never ask for them.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background, paddingHorizontal: 20, paddingTop: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  back: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", width: 52 },
  heading: { color: theme.colors.text, fontSize: 18, fontWeight: "900" },
  body: { color: theme.colors.muted, fontSize: 11, lineHeight: 18, textAlign: "center", marginBottom: 20 },
  qrCard: { alignItems: "center", backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 22, padding: 22 },
  qrFrame: { backgroundColor: "#FFFFFF", padding: 12, borderRadius: 14 },
  network: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", letterSpacing: 0.7, marginTop: 20 },
  address: { color: theme.colors.text, fontSize: 11, lineHeight: 18, textAlign: "center", marginTop: 12 },
  copyButton: { width: "100%", backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 18 },
  copyText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  warning: { marginTop: 16, padding: 15, backgroundColor: "#211A16", borderColor: "#51402A", borderWidth: 1, borderRadius: 14 },
  warningTitle: { color: theme.colors.warning, fontSize: 11, fontWeight: "900", marginBottom: 6 },
  warningText: { color: theme.colors.muted, fontSize: 10, lineHeight: 17 }
});
