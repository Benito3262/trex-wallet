import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { EvmNetwork } from "../config/networks";
import { theme } from "../theme";
import { inspectErc20Token } from "../wallet/tokens";
import type { TokenBalance } from "../wallet/tokens";
import { saveCustomToken } from "../wallet/tokenStore";

export function AddToken({ network, walletAddress, onBack, onAdded }: {
  network: EvmNetwork;
  walletAddress: string;
  onBack: () => void;
  onAdded: () => void;
}) {
  const [contractAddress, setContractAddress] = useState("");
  const [token, setToken] = useState<TokenBalance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function inspect() {
    setBusy(true);
    setError("");
    setToken(null);
    try {
      const info = await inspectErc20Token(network, contractAddress.trim(), walletAddress);
      setToken(info);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to read this token contract.");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await saveCustomToken({
        chainId: token.chainId,
        contractAddress: token.contractAddress,
        name: token.name,
        symbol: token.symbol,
        decimals: token.decimals
      });
      onAdded();
    } catch {
      setError("Token details could not be saved on this device.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ BACK</Text></Pressable>
        <Text style={styles.heading}>Add token</Text>
        <View style={{ width: 52 }} />
      </View>
      <Text style={styles.body}>Add an ERC-20 contract to your asset list on {network.name}. TREX reads the contract directly from the selected network.</Text>
      <Text style={styles.label}>TOKEN CONTRACT ADDRESS</Text>
      <TextInput
        value={contractAddress}
        onChangeText={(value) => { setContractAddress(value); setToken(null); }}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        placeholder="0x..."
        placeholderTextColor={theme.colors.muted}
        style={styles.input}
      />
      {!token ? (
        <Pressable style={[styles.primary, (busy || !contractAddress.trim()) && styles.disabled]} disabled={busy || !contractAddress.trim()} onPress={inspect}>
          <Text style={styles.primaryText}>{busy ? "READING CONTRACT..." : "CHECK TOKEN"}</Text>
        </Pressable>
      ) : (
        <>
          <View style={styles.tokenCard}>
            <Text style={styles.tokenName}>{token.name}</Text>
            <Text style={styles.tokenSymbol}>{token.symbol}</Text>
            <Text style={styles.tokenBalance}>{token.balance} {token.symbol}</Text>
            <Text selectable style={styles.address}>{token.contractAddress}</Text>
            <Text style={styles.meta}>Decimals: {token.decimals} · Chain: {token.chainId}</Text>
          </View>
          <View style={styles.warning}>
            <Text style={styles.warningTitle}>Unverified token</Text>
            <Text style={styles.warningText}>Token names, symbols and balances are supplied by the contract and can be misleading. Verify this exact contract address from a trusted source before adding or interacting with it. Adding a token does not make it safe.</Text>
          </View>
          <Pressable style={[styles.primary, busy && styles.disabled]} disabled={busy} onPress={add}>
            <Text style={styles.primaryText}>{busy ? "SAVING..." : "ADD TO ASSETS"}</Text>
          </Pressable>
          <Pressable style={styles.secondary} onPress={() => setToken(null)}><Text style={styles.secondaryText}>CHECK ANOTHER CONTRACT</Text></Pressable>
        </>
      )}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Text style={styles.disclaimer}>READ-ONLY TOKEN LOOKUP · NO APPROVAL OR TRANSFER IS PERFORMED</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  back: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", width: 52 },
  heading: { color: theme.colors.text, fontSize: 18, fontWeight: "900" },
  body: { color: theme.colors.muted, fontSize: 11, lineHeight: 18, marginBottom: 20 },
  label: { color: theme.colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 7 },
  input: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13, color: theme.colors.text, fontSize: 11 },
  primary: { backgroundColor: theme.colors.primary, borderRadius: 13, alignItems: "center", paddingVertical: 15, marginTop: 18 },
  primaryText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  disabled: { opacity: 0.45 },
  tokenCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 20 },
  tokenName: { color: theme.colors.text, fontSize: 16, fontWeight: "900" },
  tokenSymbol: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", marginTop: 4 },
  tokenBalance: { color: theme.colors.text, fontSize: 22, fontWeight: "900", marginTop: 18 },
  address: { color: theme.colors.muted, fontSize: 9, lineHeight: 15, marginTop: 10 },
  meta: { color: theme.colors.muted, fontSize: 9, marginTop: 8 },
  warning: { backgroundColor: "#211A16", borderColor: "#51402A", borderWidth: 1, borderRadius: 13, padding: 14, marginTop: 14 },
  warningTitle: { color: theme.colors.warning, fontSize: 10, fontWeight: "900", marginBottom: 6 },
  warningText: { color: theme.colors.muted, fontSize: 10, lineHeight: 17 },
  secondary: { alignItems: "center", padding: 14 },
  secondaryText: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  error: { color: theme.colors.danger, fontSize: 11, lineHeight: 17, marginTop: 14 },
  disclaimer: { color: "#766C87", fontSize: 8, textAlign: "center", letterSpacing: 1, marginTop: 28 }
});
