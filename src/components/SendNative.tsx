import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { EvmNetwork } from "../config/networks";
import { theme } from "../theme";
import { loadWallet } from "../wallet/vault";
import { NativeTransferPreview, prepareNativeTransfer, sendNativeTransfer } from "../wallet/transactions";
import { recordTransaction } from "../wallet/history";

export function SendNative({ address, network, onBack, onSent }: {
  address: string;
  network: EvmNetwork;
  onBack: () => void;
  onSent: (hash: string) => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [preview, setPreview] = useState<NativeTransferPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");

  async function review() {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      const next = await prepareNativeTransfer(network, address, recipient, amount);
      setPreview(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to prepare this transfer.");
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
      const txHash = await sendNativeTransfer(network, wallet, recipient, amount);
      try {
        await recordTransaction({
          hash: txHash,
          chainId: network.chainId,
          networkName: network.name,
          symbol: network.symbol,
          amount: amount.trim(),
          toAddress: recipient.trim(),
          fromAddress: wallet.address,
          createdAt: new Date().toISOString(),
          status: "submitted"
        });
      } catch {
        // The network submission succeeded; a local history write must not
        // misreport the transaction as failed.
      }
      setHash(txHash);
      onSent(txHash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The transaction was not sent.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ BACK</Text></Pressable>
        <Text style={styles.heading}>Send {network.symbol}</Text>
        <View style={{ width: 52 }} />
      </View>
      {!hash ? (
        <>
          <Text style={styles.body}>Send the network's native asset from your wallet. TREX will estimate the fee and show the recipient before you approve the signature.</Text>
          <Text style={styles.fieldLabel}>NETWORK</Text>
          <View style={styles.readOnly}><Text style={styles.readOnlyText}>{network.name} · Chain {network.chainId}</Text></View>
          <Text style={styles.fieldLabel}>RECIPIENT ADDRESS</Text>
          <TextInput value={recipient} onChangeText={(v) => { setRecipient(v); setPreview(null); }} autoCapitalize="none" autoCorrect={false} spellCheck={false} placeholder="0x..." placeholderTextColor={theme.colors.muted} style={styles.input} />
          <Text style={styles.fieldLabel}>AMOUNT ({network.symbol})</Text>
          <TextInput value={amount} onChangeText={(v) => { setAmount(v); setPreview(null); }} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={theme.colors.muted} style={styles.input} />
          {!preview ? (
            <Pressable onPress={review} disabled={busy || !recipient || !amount} style={[styles.primary, (busy || !recipient || !amount) && styles.disabled]}>
              <Text style={styles.primaryText}>{busy ? "CHECKING NETWORK..." : "REVIEW TRANSFER"}</Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.reviewCard}>
                <Text style={styles.reviewTitle}>Review carefully</Text>
                <Text style={styles.detailLabel}>RECIPIENT</Text>
                <Text selectable style={styles.detailValue}>{preview.to}</Text>
                <Text style={styles.detailLabel}>AMOUNT</Text>
                <Text style={styles.amountValue}>{preview.amount} {preview.symbol}</Text>
                <Text style={styles.detailLabel}>ESTIMATED NETWORK FEE</Text>
                <Text style={styles.detailValue}>{Number(preview.estimatedNetworkFee).toFixed(8)} {preview.symbol}</Text>
                <Text style={styles.detailLabel}>MAXIMUM TOTAL</Text>
                <Text style={styles.detailValue}>{Number(preview.totalMaximum).toFixed(8)} {preview.symbol}</Text>
                <Text style={styles.detailLabel}>SENDING FROM</Text>
                <Text selectable style={styles.detailValue}>{address}</Text>
              </View>
              <View style={styles.warning}>
                <Text style={styles.warningTitle}>Before you sign</Text>
                <Text style={styles.warningText}>Crypto transfers cannot normally be reversed. Check every character of the recipient and confirm the network. This preview checks the chain, address format, balance and gas estimate. It does not guarantee recipient ownership or detect every scam.</Text>
              </View>
              <Pressable onPress={confirmAndSend} disabled={busy} style={[styles.primary, busy && styles.disabled]}>
                <Text style={styles.primaryText}>{busy ? "AUTHENTICATING AND SENDING..." : "CONFIRM AND SEND"}</Text>
              </Pressable>
              <Pressable onPress={() => setPreview(null)} style={styles.editButton}><Text style={styles.editText}>EDIT TRANSFER</Text></Pressable>
            </>
          )}
        </>
      ) : (
        <View style={styles.successCard}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Transaction submitted</Text>
          <Text style={styles.body}>Your transaction was sent to the network. It is not confirmed until the chain includes it in a block.</Text>
          <Text style={styles.detailLabel}>TRANSACTION HASH</Text>
          <Text selectable style={styles.detailValue}>{hash}</Text>
          <Pressable onPress={onBack} style={styles.primary}><Text style={styles.primaryText}>DONE</Text></Pressable>
        </View>
      )}
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      <Text style={styles.disclaimer}>EARLY PREVIEW · USE TEST FUNDS UNTIL SECURITY REVIEW IS COMPLETE</Text>
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
  fieldLabel: { color: theme.colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginBottom: 7, marginTop: 15 },
  readOnly: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, padding: 13 },
  readOnlyText: { color: theme.colors.text, fontSize: 12, fontWeight: "700" },
  input: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13, color: theme.colors.text, fontSize: 12 },
  primary: { backgroundColor: theme.colors.primary, borderRadius: 13, alignItems: "center", paddingVertical: 15, marginTop: 20 },
  primaryText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  disabled: { opacity: 0.45 },
  reviewCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 20 },
  reviewTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "900", marginBottom: 12 },
  detailLabel: { color: theme.colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginTop: 10, marginBottom: 5 },
  detailValue: { color: theme.colors.text, fontSize: 10, lineHeight: 16 },
  amountValue: { color: theme.colors.primaryBright, fontSize: 20, fontWeight: "900" },
  warning: { backgroundColor: "#211A16", borderColor: "#51402A", borderWidth: 1, borderRadius: 13, padding: 14, marginTop: 14 },
  warningTitle: { color: theme.colors.warning, fontSize: 10, fontWeight: "900", marginBottom: 6 },
  warningText: { color: theme.colors.muted, fontSize: 10, lineHeight: 17 },
  editButton: { alignItems: "center", padding: 14 },
  editText: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  successCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 18, padding: 18, marginTop: 30 },
  successIcon: { color: theme.colors.success, fontSize: 34, fontWeight: "900", marginBottom: 12 },
  successTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "900", marginBottom: 9 },
  error: { color: theme.colors.danger, fontSize: 11, lineHeight: 17, marginTop: 14 },
  disclaimer: { color: "#766C87", fontSize: 8, textAlign: "center", letterSpacing: 1, marginTop: 28 }
});
