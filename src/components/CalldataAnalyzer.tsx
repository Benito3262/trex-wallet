import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { theme } from "../theme";
import { analyzeEvmTransaction, TransactionAnalysis } from "../security/analyzeTransaction";

const riskColor = (risk: TransactionAnalysis["riskLevel"]) => {
  if (risk === "critical") return theme.colors.danger;
  if (risk === "high") return "#F29B38";
  if (risk === "warning") return theme.colors.warning;
  return theme.colors.success;
};

export function CalldataAnalyzer() {
  const [data, setData] = useState("");
  const [result, setResult] = useState<TransactionAnalysis | null>(null);
  const [error, setError] = useState("");

  function analyze() {
    const normalized = data.trim();
    if (!/^0x([0-9a-fA-F]{2})*$/.test(normalized) || normalized.length < 10) {
      setResult(null);
      setError("Enter valid hexadecimal transaction calldata beginning with 0x.");
      return;
    }
    setError("");
    setResult(analyzeEvmTransaction(normalized));
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Calldata inspector</Text>
      <Text style={styles.body}>Paste contract calldata from a transaction request to decode selected common ERC-20 methods. This is an offline helper, not a full transaction simulator or safety guarantee.</Text>
      <TextInput
        value={data}
        onChangeText={(value) => { setData(value); setResult(null); }}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        placeholder="0x..."
        placeholderTextColor={theme.colors.muted}
        style={styles.input}
      />
      <Pressable onPress={analyze} style={styles.button}><Text style={styles.buttonText}>INSPECT CALL DATA</Text></Pressable>
      {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {result && (
        <View style={styles.result}>
          <View style={styles.resultTop}>
            <Text style={styles.method}>{result.method}</Text>
            <Text style={[styles.risk, { color: riskColor(result.riskLevel) }]}>{result.riskLevel.toUpperCase()}</Text>
          </View>
          <Text style={styles.summary}>{result.summary}</Text>
          <Text style={styles.selector}>Selector: {result.selector}</Text>
          {result.addresses.map((address) => <Text selectable key={address} style={styles.address}>{address}</Text>)}
          {result.warnings.map((warning, index) => <Text key={index} style={styles.warning}>• {warning}</Text>)}
          {result.amountRaw && <Text style={styles.amount}>Raw amount: {result.amountRaw} (token decimals are not inferred)</Text>}
        </View>
      )}
      <Text style={styles.footnote}>The inspector does not check the destination contract, token identity, chain, spender reputation, or actual execution effects. Unknown calls are not safe by default.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, padding: 15, marginTop: 20 },
  title: { color: theme.colors.text, fontSize: 13, fontWeight: "900" },
  body: { color: theme.colors.muted, fontSize: 10, lineHeight: 16, marginTop: 7, marginBottom: 12 },
  input: { minHeight: 82, maxHeight: 150, textAlignVertical: "top", backgroundColor: theme.colors.background, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 10, padding: 11, color: theme.colors.text, fontSize: 10 },
  button: { backgroundColor: theme.colors.primary, borderRadius: 10, alignItems: "center", padding: 12, marginTop: 10 },
  buttonText: { color: "#FFFFFF", fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  error: { color: theme.colors.danger, fontSize: 10, marginTop: 10 },
  result: { borderTopWidth: 1, borderTopColor: theme.colors.border, marginTop: 14, paddingTop: 13 },
  resultTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  method: { color: theme.colors.text, fontSize: 12, fontWeight: "900", flex: 1 },
  risk: { fontSize: 9, fontWeight: "900", letterSpacing: 0.8 },
  summary: { color: theme.colors.text, fontSize: 11, lineHeight: 17, marginTop: 9 },
  selector: { color: theme.colors.muted, fontSize: 9, marginTop: 9 },
  address: { color: theme.colors.primaryBright, fontSize: 9, marginTop: 7 },
  warning: { color: theme.colors.warning, fontSize: 10, lineHeight: 16, marginTop: 7 },
  amount: { color: theme.colors.muted, fontSize: 9, marginTop: 8 },
  footnote: { color: theme.colors.muted, fontSize: 9, lineHeight: 15, marginTop: 13 }
});
