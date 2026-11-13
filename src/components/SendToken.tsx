import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { EvmNetwork } from "../config/networks";
import { theme } from "../theme";
import { loadWallet } from "../wallet/vault";
import { recordTransaction } from "../wallet/history";
import { prepareErc20Transfer, sendErc20Transfer } from "../wallet/erc20Transactions";
import type { Erc20TransferPreview } from "../wallet/erc20Transactions";
import type { TokenMetadata } from "../wallet/tokens";

export function SendToken({ address, network, token, onBack, onSent }: {
  address: string;
  network: EvmNetwork;
  token: TokenMetadata;
  onBack: () => void;
  onSent: (hash: string) => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<Erc20TransferPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function review() {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      setPreview(await prepareErc20Transfer(network, address, token, recipient, amount));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to prepare this token transfer.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAndSend() {
    setBusy(true);
    setError("");
    try {
      const wallet = await loadWallet();
      if (!wallet) throw new Error("Wallet not found. Restore it from your recovery phrase.");
      const hash = await sendErc20Transfer(network, wallet, token, recipient, amount);
      try {
        await recordTransaction({
          hash,
          chainId: network.chainId,
          networkName: network.name,
          symbol: token.symbol,
          amount: amount.trim(),
          toAddress: recipient.trim(),
          fromAddress: wallet.address,
          createdAt: new Date().toISOString(),
          status: "submitted"
        });
      } catch {
        // Do not misreport a broadcast transaction if local history storage fails.
      }
      onSent(hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The token transfer was not sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ BACK</Text></Pressable>
        <Text style={styles.heading}>Send {token.symbol}</Text>
        <View style={{ width: 52 }} />
      </View>
      <Text style={styles.body}>Send this ERC-20 token on {network.name}. This contract was added manually and has not been independently verified by TREX.</Text>
      <Text style={styles.label}>RECIPIENT ADDRESS</Text>
      <TextInput value={recipient} onChangeText={(v) => { setRecipient(v); setPreview(null); }} autoCapitalize="none" autoCorrect={false} spellCheck={false} placeholder="0x..." placeholderTextColor={theme.colors.muted} style={styles.input} />
      <Text style={styles.label}>AMOUNT ({token.symbol})</Text>
      <TextInput value={amount} onChangeText={(v) => { setAmount(v); setPreview(null); }} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={theme.colors.muted} style={styles.input} />
      {!preview ? (
        <Pressable onPress={review} disabled={busy || !recipient || !amount} style={[styles.primary, (busy || !recipient || !amount) && styles.disabled]}>
          <Text style={styles.primaryText}>{busy ? "CHECKING TOKEN AND NETWORK..." : "REVIEW TOKEN TRANSFER"}</Text>
        </Pressable>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Review transfer</Text>
            <Text style={styles.label}>TOKEN CONTRACT</Text>
            <Text selectable style={styles.value}>{preview.contractAddress}</Text>
            <Text style={styles.label}>RECIPIENT</Text>
            <Text selectable style={styles.value}>{preview.recipient}</Text>
            <Text style={styles.label}>TOKEN AMOUNT</Text>
            <Text style={styles.amountValue}>{preview.amount} {preview.symbol}</Text>
            <Text style={styles.label}>ESTIMATED NETWORK FEE</Text>
            <Text style={styles.value}>{Number(preview.networkFee).toFixed(8)} {network.symbol}</Text>
          </View>
          <View style={styles.warning}>
            <Text style={styles.warningTitle}>Unverified contract</Text>
            <Text style={styles.warningText}>TREX checks the contract code, token balance, decimals, symbol, chain and gas estimate. It does not verify that this token is legitimate or valuable. Verify the contract and recipient independently. Transfers are normally irreversible.</Text>
          </View>
          <Pressable onPress={confirmAndSend} disabled={busy} style={[styles.primary, busy && styles.disabled]}>
            <Text style={styles.primaryText}>{busy ? "AUTHENTICATING AND SENDING..." : "CONFIRM AND SEND"}</Text>
          </Pressable>
          <Pressable onPress={() => setPreview(null)} style={styles.secondary}><Text style={styles.secondaryText}>EDIT TRANSFER</Text></Pressable>
        </>
      )}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Text style={styles.disclaimer}>TESTNET ONLY · VERIFY TOKEN CONTRACTS YOURSELF</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 30 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 18 },
  back: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", width: 52 },
  heading: { color: theme.colors.text, fontSize: 18, fontWeight: "900" },
  body: { color: theme.colors.muted, fontSize: 11, lineHeight: 18, marginBottom: 18 },
  label: { color: theme.colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginTop: 15, marginBottom: 7 },
  input: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13, color: theme.colors.text, fontSize: 12 },
  primary: { backgroundColor: theme.colors.primary, borderRadius: 13, alignItems: "center", paddingVertical: 15, marginTop: 20 },
  primaryText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  disabled: { opacity: 0.45 },
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 20 },
  cardTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "900" },
  value: { color: theme.colors.text, fontSize: 10, lineHeight: 16 },
  amountValue: { color: theme.colors.primaryBright, fontSize: 20, fontWeight: "900" },
  warning: { backgroundColor: "#211A16", borderColor: "#51402A", borderWidth: 1, borderRadius: 13, padding: 14, marginTop: 14 },
  warningTitle: { color: theme.colors.warning, fontSize: 10, fontWeight: "900", marginBottom: 6 },
  warningText: { color: theme.colors.muted, fontSize: 10, lineHeight: 17 },
  secondary: { alignItems: "center", padding: 14 },
  secondaryText: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  error: { color: theme.colors.danger, fontSize: 11, lineHeight: 17, marginTop: 14 },
  disclaimer: { color: "#766C87", fontSize: 8, textAlign: "center", letterSpacing: 1, marginTop: 28 }
});
