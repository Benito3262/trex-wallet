import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { AnimatedPressable as Pressable } from "./AnimatedPressable";
import { afterPaint } from "../utils/defer";
import * as Clipboard from "expo-clipboard";
import { usePreventScreenCapture } from "expo-screen-capture";
import {
  addDerivedAccount,
  loadRegistry,
  removeAccount,
  renameAccount,
  setActiveAccount,
  subscribeRegistry,
  unlockAccount
} from "../wallet/vault";
import { activeAccount, type AccountMeta, type AccountRegistry } from "../wallet/accounts";
import { theme } from "../theme";
import { BottomSheet, FadeIn, SheetTextInput, SpringPressable, useLingering } from "./motion";

type Props = {
  onBack: () => void;
  onAddWallet: () => void;
  /** Called with the new active address, or null when every account was removed. */
  onActiveChanged: (address: string | null) => void;
};

function short(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}

export function WalletManager({ onBack, onAddWallet, onActiveChanged }: Props) {
  usePreventScreenCapture();
  const [registry, setRegistry] = useState<AccountRegistry | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [renameTarget, setRenameTarget] = useState<AccountMeta | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [removeTarget, setRemoveTarget] = useState<AccountMeta | null>(null);
  const shownRemove = useLingering(removeTarget);
  const [privateKey, setPrivateKey] = useState("");

  useEffect(() => {
    loadRegistry().then(setRegistry).catch(() => setMessage("Could not load accounts."));
    const unsubscribe = subscribeRegistry(setRegistry);
    return () => { unsubscribe(); setPrivateKey(""); };
  }, []);

  const active = registry ? activeAccount(registry) : undefined;

  async function run(task: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    await afterPaint();
    try { await task(); } catch (error) {
      setMessage(error instanceof Error ? error.message : "That did not work. Try again.");
    } finally { setBusy(false); }
  }

  function switchTo(account: AccountMeta) {
    void run(async () => {
      setPrivateKey("");
      const next = await setActiveAccount(account.id);
      onActiveChanged(activeAccount(next)?.address ?? null);
      setMessage(`${account.name} is now active.`);
    });
  }

  function derive(secretId: string) {
    void run(async () => {
      const account = await addDerivedAccount(secretId);
      setPrivateKey("");
      onActiveChanged(account.address);
      setMessage(`${account.name} added from the same recovery phrase (${account.derivationPath}).`);
    });
  }

  function confirmRename() {
    if (!renameTarget) return;
    void run(async () => {
      await renameAccount(renameTarget.id, renameValue);
      setRenameTarget(null);
    });
  }

  function confirmRemove() {
    if (!removeTarget) return;
    const target = removeTarget;
    void run(async () => {
      const next = await removeAccount(target.id);
      setRemoveTarget(null);
      setPrivateKey("");
      onActiveChanged(activeAccount(next)?.address ?? null);
    });
  }

  function revealKey() {
    if (privateKey) { setPrivateKey(""); return; }
    void run(async () => {
      const { signer } = await unlockAccount(active?.id, "Authenticate to reveal this private key");
      setPrivateKey(signer.privateKey);
    });
  }

  async function copy(value: string, label: string) {
    try {
      await Clipboard.setStringAsync(value);
      setMessage(`${label} copied. Treat clipboard contents as sensitive.`);
    } catch {
      setMessage("Could not copy to clipboard.");
    }
  }

  const removingLastOfSecret = !!removeTarget && !!registry &&
    registry.accounts.filter((account) => account.secretId === removeTarget.secretId).length === 1;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ BACK TO WALLET</Text></Pressable>
        <FadeIn>
          <Text style={styles.kicker}>ACCOUNTS & SECURITY</Text>
          <Text style={styles.title}>Your accounts</Text>
          <Text style={styles.intro}>Every recovery phrase and key stays on this device behind your biometrics. Tap an account to make it active.</Text>
        </FadeIn>

        {!registry && <ActivityIndicator color={theme.colors.primaryBright} style={{ marginTop: 24 }} />}

        {registry?.secrets.map((secret, groupIndex) => {
          const accounts = registry.accounts.filter((account) => account.secretId === secret.id);
          return (
            <FadeIn key={secret.id} delay={groupIndex * 60} style={styles.group}>
              <Text style={styles.groupLabel}>{secret.label.toUpperCase()} · {secret.kind === "mnemonic" ? "HD WALLET" : "SINGLE KEY"}</Text>
              {accounts.map((account) => {
                const isActive = account.id === active?.id;
                return (
                  <View key={account.id} style={[styles.accountRow, isActive && styles.accountActive]}>
                    <Pressable style={styles.accountBody} onPress={() => switchTo(account)} disabled={busy || isActive} accessibilityRole="button" accessibilityLabel={`Use ${account.name}`}>
                      <View style={[styles.avatar, isActive && styles.avatarActive]}><Text style={styles.avatarText}>{account.name.slice(0, 1).toUpperCase()}</Text></View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.accountName}>{account.name}</Text>
                        <Text style={styles.accountMeta}>{short(account.address)} · {account.hdIndex !== null ? `#${account.hdIndex}` : "imported"}</Text>
                      </View>
                      {isActive && <Text style={styles.activeBadge}>ACTIVE</Text>}
                    </Pressable>
                    <Pressable onPress={() => { setRenameTarget(account); setRenameValue(account.name); }} accessibilityLabel={`Rename ${account.name}`} style={styles.iconButton}><Text style={styles.iconText}>✎</Text></Pressable>
                    <Pressable onPress={() => setRemoveTarget(account)} accessibilityLabel={`Remove ${account.name}`} style={styles.iconButton}><Text style={[styles.iconText, { color: theme.colors.danger }]}>×</Text></Pressable>
                  </View>
                );
              })}
              {secret.kind === "mnemonic" && (
                <SpringPressable style={styles.secondary} onPress={() => derive(secret.id)} disabled={busy}>
                  <Text style={styles.secondaryText}>+ ADD ACCOUNT FROM THIS PHRASE</Text>
                </SpringPressable>
              )}
            </FadeIn>
          );
        })}

        <SpringPressable style={styles.primary} onPress={onAddWallet} disabled={busy}>
          <Text style={styles.primaryText}>CREATE OR IMPORT ANOTHER WALLET</Text>
        </SpringPressable>

        {active && (
          <View style={styles.card}>
            <Text style={styles.label}>ACTIVE ACCOUNT · {active.name.toUpperCase()}</Text>
            <Text selectable style={styles.address}>{active.address}</Text>
            {active.derivationPath && <Text style={styles.accountMeta}>Path {active.derivationPath}</Text>}
            <Pressable style={styles.secondary} onPress={() => copy(active.address, "Wallet address")}><Text style={styles.secondaryText}>COPY ADDRESS</Text></Pressable>
            <Text style={[styles.label, { marginTop: 18 }]}>PRIVATE KEY</Text>
            <Text style={styles.warning}>Anyone with this key controls this account. Only reveal it somewhere private. Never paste it into a website or send it to anyone.</Text>
            <View style={styles.keyBox}><Text selectable style={privateKey ? styles.key : styles.masked}>{privateKey || "•••• •••• •••• •••• •••• ••••"}</Text></View>
            <Pressable style={styles.secondary} onPress={revealKey} disabled={busy}><Text style={styles.secondaryText}>{privateKey ? "HIDE PRIVATE KEY" : "REVEAL PRIVATE KEY"}</Text></Pressable>
            {!!privateKey && <Pressable style={styles.secondary} onPress={() => copy(privateKey, "Private key")}><Text style={styles.secondaryText}>COPY PRIVATE KEY</Text></Pressable>}
          </View>
        )}

        {busy && <ActivityIndicator color={theme.colors.primaryBright} style={{ marginTop: 14 }} />}
        {!!message && <Text accessibilityRole="alert" style={styles.message}>{message}</Text>}
        <Text style={styles.footer}>KEY ACCESS REQUIRES DEVICE BIOMETRIC AUTHENTICATION</Text>
      </ScrollView>

      <BottomSheet visible={!!renameTarget} onClose={() => setRenameTarget(null)}>
        <Text style={styles.sheetTitle}>Rename account</Text>
        <SheetTextInput value={renameValue} onChangeText={setRenameValue} maxLength={32} autoFocus placeholder="Account name" placeholderTextColor={theme.colors.muted} style={styles.input} />
        <SpringPressable style={styles.primary} onPress={confirmRename} disabled={busy}><Text style={styles.primaryText}>SAVE NAME</Text></SpringPressable>
        <Pressable style={styles.secondary} onPress={() => setRenameTarget(null)}><Text style={styles.secondaryText}>CANCEL</Text></Pressable>
      </BottomSheet>

      <BottomSheet visible={!!removeTarget} onClose={() => setRemoveTarget(null)}>
        <Text style={styles.sheetTitle}>Remove {shownRemove?.name}?</Text>
        <Text style={styles.intro}>{shownRemove ? short(shownRemove.address) : ""}</Text>
        <Text style={[styles.warning, { marginTop: 12 }]}>
          {removingLastOfSecret
            ? "This is the last account using this recovery phrase or key, so the phrase or key will be deleted from this device. You can only get this account back with your written backup."
            : "The account is hidden from TREX. The recovery phrase stays on this device, and adding accounts from it again will bring this address back."}
        </Text>
        <SpringPressable style={[styles.primary, { backgroundColor: theme.colors.danger }]} onPress={confirmRemove} disabled={busy}><Text style={styles.primaryText}>YES, REMOVE ACCOUNT</Text></SpringPressable>
        <Pressable style={styles.secondary} onPress={() => setRemoveTarget(null)}><Text style={styles.secondaryText}>KEEP ACCOUNT</Text></Pressable>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 22, paddingBottom: 36 },
  back: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 28 },
  kicker: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1.7, marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: "900" },
  intro: { color: theme.colors.muted, fontSize: 11, lineHeight: 18, marginTop: 8 },
  group: { marginTop: 20 },
  groupLabel: { color: theme.colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.3, marginBottom: 8 },
  accountRow: { flexDirection: "row", alignItems: "center", backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 16, paddingLeft: 12, paddingVertical: 6, marginBottom: 8 },
  accountActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.surfaceRaised },
  accountBody: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 6 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#3A1D0C", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.colors.border },
  avatarActive: { borderColor: theme.colors.primaryBright },
  avatarText: { color: theme.colors.primaryBright, fontSize: 14, fontWeight: "900" },
  accountName: { color: theme.colors.text, fontSize: 13, fontWeight: "800" },
  accountMeta: { color: theme.colors.muted, fontSize: 10, marginTop: 3 },
  activeBadge: { color: theme.colors.primaryBright, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginRight: 4 },
  iconButton: { paddingHorizontal: 10, paddingVertical: 8 },
  iconText: { color: theme.colors.muted, fontSize: 18 },
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 20 },
  label: { color: theme.colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginBottom: 10 },
  address: { color: theme.colors.text, fontSize: 11, lineHeight: 18 },
  warning: { color: theme.colors.warning, fontSize: 10, lineHeight: 17, marginBottom: 12 },
  keyBox: { backgroundColor: theme.colors.background, borderRadius: 12, padding: 13, minHeight: 50, justifyContent: "center" },
  key: { color: theme.colors.text, fontSize: 11, lineHeight: 18 },
  masked: { color: theme.colors.muted, fontSize: 14, letterSpacing: 2 },
  primary: { backgroundColor: theme.colors.primary, borderRadius: 14, alignItems: "center", padding: 14, marginTop: 16 },
  primaryText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  secondary: { borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, alignItems: "center", padding: 12, marginTop: 10 },
  secondaryText: { color: theme.colors.text, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  input: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, backgroundColor: theme.colors.background, color: theme.colors.text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 13, marginTop: 6 },
  sheetTitle: { color: theme.colors.text, fontSize: 19, fontWeight: "900", marginBottom: 6 },
  message: { color: theme.colors.primaryBright, fontSize: 10, lineHeight: 16, marginTop: 14 },
  footer: { color: theme.colors.muted, fontSize: 8, letterSpacing: 1, textAlign: "center", marginTop: 22 }
});
