import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { createWalletIdentity, deriveWalletFromPhrase } from "../wallet/identity";
import { saveWallet } from "../wallet/vault";
import { theme } from "../theme";
import { usePreventScreenCapture } from "expo-screen-capture";

type Props = {
  onComplete: (address: string) => void;
  onCancel: () => void;
};

type Step = "choose" | "recovery" | "verify" | "import" | "saving";

const buttonStyle = {
  backgroundColor: theme.colors.primary,
  borderRadius: 14,
  paddingVertical: 15,
  alignItems: "center" as const
};

export function WalletOnboarding({ onComplete, onCancel }: Props) {
  usePreventScreenCapture();
  const [step, setStep] = useState<Step>("choose");
  const [mnemonic, setMnemonic] = useState("");
  const [address, setAddress] = useState("");
  const [challengeAnswers, setChallengeAnswers] = useState(["", ""]);
  const [error, setError] = useState("");

  const words = useMemo(() => mnemonic.split(" "), [mnemonic]);
  const challenge = useMemo(() => {
    if (words.length !== 12) return [];
    return [2, 8];
  }, [words.length]);

  function startCreate() {
    try {
      const generated = createWalletIdentity();
      setMnemonic(generated.mnemonic);
      setAddress(generated.address);
      setChallengeAnswers(["", ""]);
      setError("");
      setStep("recovery");
    } catch {
      setError("Wallet generation failed. Check device security and try again.");
    }
  }

  async function persistWallet(phrase: string, walletAddress: string, derivationPath: string) {
    setStep("saving");
    setError("");
    try {
      await saveWallet({
        mnemonic: phrase,
        address: walletAddress,
        derivationPath,
        createdAt: new Date().toISOString()
      });
      setMnemonic("");
      onComplete(walletAddress);
    } catch (e) {
      setStep("recovery");
      setError(e instanceof Error ? e.message : "Secure storage failed. Your wallet was not saved.");
    }
  }

  function verifyRecovery() {
    const valid = challenge.every((index, position) =>
      (challengeAnswers[position] || "").trim().toLowerCase() === words[index]
    );
    if (!valid) {
      setError("Those words do not match. Check your written recovery phrase and try again.");
      return;
    }
    void persistWallet(mnemonic, address, "m/44'/60'/0'/0/0");
  }

  function importWallet() {
    try {
      const derived = deriveWalletFromPhrase(mnemonic);
      void persistWallet(mnemonic.trim().replace(/\s+/g, " "), derived.address, derived.derivationPath);
    } catch {
      setError("That recovery phrase is invalid. Check all words and their order.");
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Text style={styles.brand}>TREX<Text style={{ color: theme.colors.primaryBright }}>.</Text></Text>
          <Pressable onPress={onCancel}><Text style={styles.cancel}>CANCEL</Text></Pressable>
        </View>

        {step === "choose" && (
          <>
            <Text style={styles.kicker}>YOUR KEYS. YOUR CONTROL.</Text>
            <Text style={styles.title}>Set up your wallet</Text>
            <Text style={styles.body}>Create a new wallet or restore an existing EVM wallet with its recovery phrase.</Text>
            <Pressable style={buttonStyle} onPress={startCreate}><Text style={styles.primaryText}>Create new wallet</Text></Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => { setMnemonic(""); setError(""); setStep("import"); }}>
              <Text style={styles.secondaryText}>Import recovery phrase</Text>
            </Pressable>
            <View style={styles.notice}><Text style={styles.noticeTitle}>Important</Text><Text style={styles.noticeText}>TREX Wallet never needs you to send your recovery phrase to anyone. Anyone who has it can control your funds.</Text></View>
          </>
        )}

        {step === "recovery" && (
          <>
            <Text style={styles.kicker}>BACK IT UP OFFLINE</Text>
            <Text style={styles.title}>Your recovery phrase</Text>
            <Text style={styles.body}>Write these 12 words down in order and keep them somewhere private and offline. Do not screenshot or share them.</Text>
            <View style={styles.wordGrid}>
              {words.map((word, index) => (
                <View key={index} style={styles.wordCell}>
                  <Text style={styles.wordIndex}>{index + 1}</Text>
                  <Text style={styles.word}>{word}</Text>
                </View>
              ))}
            </View>
            <View style={styles.notice}><Text style={styles.noticeTitle}>Never share these words</Text><Text style={styles.noticeText}>TREX support, this app, and any legitimate service will never ask you to disclose your phrase.</Text></View>
            <Pressable style={buttonStyle} onPress={() => { setError(""); setStep("verify"); }}><Text style={styles.primaryText}>I have written it down</Text></Pressable>
          </>
        )}

        {step === "verify" && (
          <>
            <Text style={styles.kicker}>RECOVERY CHECK</Text>
            <Text style={styles.title}>Confirm your phrase</Text>
            <Text style={styles.body}>Enter the requested words from the phrase you just wrote down.</Text>
            {challenge.map((index, position) => (
              <View key={index} style={styles.challengeRow}>
                <Text style={styles.challengeLabel}>WORD {index + 1}</Text>
                <TextInput
                  value={challengeAnswers[position]}
                  onChangeText={(value) => setChallengeAnswers((old) => old.map((v, i) => i === position ? value : v))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  placeholder="Enter word"
                  placeholderTextColor={theme.colors.muted}
                  style={styles.input}
                />
              </View>
            ))}
            <Pressable style={buttonStyle} onPress={verifyRecovery}><Text style={styles.primaryText}>Verify and protect wallet</Text></Pressable>
          </>
        )}

        {step === "import" && (
          <>
            <Text style={styles.kicker}>RESTORE AN EXISTING WALLET</Text>
            <Text style={styles.title}>Import recovery phrase</Text>
            <Text style={styles.body}>Enter your 12 or 24-word phrase on this device only. It is used locally to derive your address and save the encrypted wallet.</Text>
            <TextInput
              value={mnemonic}
              onChangeText={setMnemonic}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              placeholder="Enter your recovery words separated by spaces"
              placeholderTextColor={theme.colors.muted}
              style={[styles.input, styles.phraseInput]}
            />
            <Pressable style={buttonStyle} onPress={importWallet}><Text style={styles.primaryText}>Validate and protect wallet</Text></Pressable>
          </>
        )}

        {step === "saving" && (
          <View style={styles.saving}>
            <Text style={styles.title}>Protecting your wallet</Text>
            <Text style={styles.body}>Complete the device authentication prompt to store your recovery phrase in secure storage.</Text>
          </View>
        )}

        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Text style={styles.disclaimer}>EARLY PREVIEW · DO NOT USE WITH REAL FUNDS</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { flexGrow: 1, padding: 22, paddingTop: 14 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 38 },
  brand: { color: theme.colors.text, fontSize: 28, fontWeight: "900", letterSpacing: 2 },
  cancel: { color: theme.colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1.2, padding: 8 },
  kicker: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1.8, marginBottom: 10 },
  title: { color: theme.colors.text, fontSize: 27, fontWeight: "900", marginBottom: 10 },
  body: { color: theme.colors.muted, fontSize: 13, lineHeight: 21, marginBottom: 24 },
  primaryText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  secondaryButton: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 12 },
  secondaryText: { color: theme.colors.text, fontSize: 13, fontWeight: "700" },
  notice: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 14, padding: 15, marginTop: 22 },
  noticeTitle: { color: theme.colors.warning, fontSize: 11, fontWeight: "900", marginBottom: 6 },
  noticeText: { color: theme.colors.muted, fontSize: 11, lineHeight: 18 },
  wordGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
  wordCell: { width: "31.5%", minHeight: 48, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 7 },
  wordIndex: { color: theme.colors.muted, fontSize: 9 },
  word: { color: theme.colors.text, fontSize: 11, fontWeight: "700" },
  challengeRow: { marginBottom: 14 },
  challengeLabel: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginBottom: 7 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, backgroundColor: theme.colors.surface, color: theme.colors.text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 13 },
  phraseInput: { minHeight: 125, textAlignVertical: "top", marginBottom: 16 },
  saving: { flex: 1, justifyContent: "center" },
  error: { color: theme.colors.danger, fontSize: 11, lineHeight: 17, marginTop: 15 },
  disclaimer: { color: "#766C87", fontSize: 8, textAlign: "center", letterSpacing: 1.1, paddingTop: 28, paddingBottom: 10 }
});
