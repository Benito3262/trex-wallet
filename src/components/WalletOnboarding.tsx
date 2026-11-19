import React, { useMemo, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { AnimatedPressable as Pressable } from "./AnimatedPressable";
import { afterPaint } from "../utils/defer";
import { createWalletIdentity } from "../wallet/identity";
import { addMnemonicWallet, addPrivateKeyWallet, restoreMnemonicWallet } from "../wallet/vault";
import { addressFromPrivateKey, deriveHdAccount } from "../wallet/accounts";
import { theme } from "../theme";
import { BrandLogo, Wordmark } from "./brand";
import { usePreventScreenCapture } from "expo-screen-capture";
import * as LocalAuthentication from "expo-local-authentication";

type Props = {
  onComplete: (address: string) => void;
  onCancel: () => void;
  initialMode?: "choose" | "import";
  /** setup: first wallet; add: another wallet next to existing ones; restore: re-protect an existing phrase. */
  purpose?: "setup" | "add" | "restore";
};

type Step = "choose" | "recovery" | "verify" | "import" | "importKey" | "saving";

const buttonStyle = {
  backgroundColor: theme.colors.primary,
  borderRadius: 14,
  paddingVertical: 15,
  alignItems: "center" as const
};

export function WalletOnboarding({ onComplete, onCancel, initialMode = "choose", purpose = "setup" }: Props) {
  usePreventScreenCapture();
  const [step, setStep] = useState<Step>(initialMode === "import" ? "import" : "choose");
  const [mnemonic, setMnemonic] = useState("");
  const [address, setAddress] = useState("");
  const [createdPath, setCreatedPath] = useState("");
  const [privateKeyInput, setPrivateKeyInput] = useState("");
  const [challengeAnswers, setChallengeAnswers] = useState(["", ""]);
  const [error, setError] = useState("");

  const words = useMemo(() => mnemonic.split(" "), [mnemonic]);
  const challenge = useMemo(() => {
    if (words.length !== 12) return [];
    return [2, 8];
  }, [words.length]);

  const [creating, setCreating] = useState(false);
  async function startCreate() {
    if (creating) return;
    setCreating(true);
    setError("");
    // Show the spinner first: generating + deriving a phrase blocks JS for about a second.
    await afterPaint();
    try {
      const generated = createWalletIdentity();
      setMnemonic(generated.mnemonic);
      setAddress(generated.address);
      setCreatedPath(generated.derivationPath);
      setChallengeAnswers(["", ""]);
      setError("");
      setStep("recovery");
    } catch {
      setError("Wallet generation failed. Check device security and try again.");
    } finally {
      setCreating(false);
    }
  }

  async function persistWallet(secret: { kind: "mnemonic"; value: string } | { kind: "privateKey"; value: string }, retryStep: Step, precomputed?: { address: string; derivationPath: string }) {
    setStep("saving");
    setError("");
    await afterPaint();
    try {
      const biometricHardware = await LocalAuthentication.hasHardwareAsync();
      const biometricEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!biometricHardware || !biometricEnrolled) {
        throw new Error("Set up fingerprint or face unlock on this Android device before creating or importing a TREX wallet.");
      }
      const account = secret.kind === "privateKey"
        ? await addPrivateKeyWallet(secret.value)
        : purpose === "restore"
          ? await restoreMnemonicWallet(secret.value)
          : await addMnemonicWallet(secret.value, undefined, precomputed);
      setMnemonic("");
      setPrivateKeyInput("");
      onComplete(account.address);
    } catch (e) {
      setStep(retryStep);
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
    void persistWallet({ kind: "mnemonic", value: mnemonic }, "verify", address ? { address, derivationPath: createdPath } : undefined);
  }

  async function importWallet() {
    try {
      deriveHdAccount(mnemonic, 0);
      void persistWallet({ kind: "mnemonic", value: mnemonic }, "import");
    } catch {
      setError("That recovery phrase is invalid. Check all words and their order.");
    }
  }

  function importPrivateKey() {
    try {
      addressFromPrivateKey(privateKeyInput);
      void persistWallet({ kind: "privateKey", value: privateKeyInput }, "importKey");
    } catch {
      setError("That private key is invalid. It must be 64 hexadecimal characters.");
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><BrandLogo size={34} glow={false} /><Wordmark height={22} tagline /></View>
          <Pressable onPress={onCancel}><Text style={styles.cancel}>CANCEL</Text></Pressable>
        </View>

        {step === "choose" && (
          <>
            {purpose === "setup" && <BrandLogo size={128} style={{ alignSelf: "center", marginBottom: 22 }} />}
            <Text style={styles.kicker}>YOUR KEYS. YOUR CONTROL.</Text>
            <Text style={styles.title}>{purpose === "add" ? "Add another wallet" : "Set up your wallet"}</Text>
            <Text style={styles.body}>{purpose === "add" ? "Create a new recovery phrase or import one you already have. Each wallet is protected separately by your device biometrics." : "Create a new wallet or restore an existing EVM wallet with its recovery phrase."}</Text>
            <Pressable style={[buttonStyle, creating && { opacity: 0.85 }]} onPress={startCreate} disabled={creating} haptic="medium" accessibilityState={{ busy: creating }}>
              {creating ? <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><ActivityIndicator color="#FFFFFF" size="small" /><Text style={styles.primaryText}>Generating secure keys…</Text></View> : <Text style={styles.primaryText}>Create new wallet</Text>}
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={() => { setMnemonic(""); setError(""); setStep("import"); }}>
              <Text style={styles.secondaryText}>Import recovery phrase</Text>
            </Pressable>
            {purpose === "add" && (
              <Pressable style={styles.secondaryButton} onPress={() => { setPrivateKeyInput(""); setError(""); setStep("importKey"); }}>
                <Text style={styles.secondaryText}>Import private key</Text>
              </Pressable>
            )}
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
            <Text style={styles.body}>Enter your 12 or 24-word phrase on this device only. It is used locally to derive your address and save the encrypted wallet. Disable keyboard learning for sensitive input if your keyboard offers that setting.</Text>
            <TextInput
              value={mnemonic}
              onChangeText={setMnemonic}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              importantForAutofill="no"
              placeholder="Enter your recovery words separated by spaces"
              placeholderTextColor={theme.colors.muted}
              style={[styles.input, styles.phraseInput]}
            />
            <Pressable style={buttonStyle} onPress={importWallet}><Text style={styles.primaryText}>Validate and protect wallet</Text></Pressable>
          </>
        )}

        {step === "importKey" && (
          <>
            <Text style={styles.kicker}>IMPORT ONE ACCOUNT</Text>
            <Text style={styles.title}>Import private key</Text>
            <Text style={styles.body}>A private key controls exactly one account. It is checked on this device and stored behind your biometrics. TREX cannot derive more accounts from it.</Text>
            <TextInput
              value={privateKeyInput}
              onChangeText={setPrivateKeyInput}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              importantForAutofill="no"
              secureTextEntry
              placeholder="0x… (64 hexadecimal characters)"
              placeholderTextColor={theme.colors.muted}
              style={[styles.input, { marginBottom: 16 }]}
            />
            <Pressable style={buttonStyle} onPress={importPrivateKey}><Text style={styles.primaryText}>Validate and protect key</Text></Pressable>
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
  disclaimer: { color: "#8F6B4B", fontSize: 8, textAlign: "center", letterSpacing: 1.1, paddingTop: 28, paddingBottom: 10 }
});
