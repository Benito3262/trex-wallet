import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import type { EvmNetwork } from "../config/networks";
import { approvalQueue } from "../dapp/approvalCenter";
import { encodeRevoke } from "../security/approvalRewrite";
import { PERMIT2_ADDRESS } from "../security/typedData";
import { readApprovalStatuses, type ApprovalStatus } from "../wallet/approvalsChain";
import { forgetApproval, listApprovals } from "../wallet/localStore";
import { errorMessage } from "../wallet/rpc";
import { theme } from "../theme";
import { FadeIn, SpringPressable } from "./motion";

function short(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

/** Lists allowances granted through TREX with their live on-chain state and a one-tap revoke. */
export function OpenApprovals({ address, network, onBack }: { address: string; network: EvmNetwork; onBack: () => void }) {
  const [items, setItems] = useState<ApprovalStatus[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const tracked = await listApprovals(address, network.chainId);
      setItems(await readApprovalStatuses(network, tracked));
    } catch (error) {
      setItems([]);
      setMessage(errorMessage(error, "Could not load approvals."));
    } finally {
      setLoading(false);
    }
  }, [address, network]);

  useEffect(() => { void load(); }, [load]);

  async function revoke(item: ApprovalStatus) {
    setMessage("");
    try {
      const call = item.kind === "erc20"
        ? { kind: "erc20" as const, spender: item.spender, amount: 0n, unlimited: false }
        : item.kind === "permit2"
          ? { kind: "permit2" as const, token: item.token, spender: item.spender, amount: 0n, expiration: 0, unlimited: false }
          : { kind: "setApprovalForAll" as const, operator: item.spender, approved: false };
      const { data } = encodeRevoke(call, item.token);
      const to = item.kind === "permit2" ? PERMIT2_ADDRESS : item.token;
      const hash = await approvalQueue.ask({
        type: "sign",
        peer: { origin: "trex://open-approvals", source: "internal", name: "TREX · Revoke approval" },
        chainId: network.chainId,
        request: { kind: "transaction", address, tx: { from: address, to, data, value: "0x0" } }
      });
      setMessage(`Revoke sent: ${hash.slice(0, 12)}…. It disappears once the chain confirms zero.`);
      setTimeout(() => { void load(); }, 15000);
    } catch (error) {
      setMessage(errorMessage(error, "Revoke cancelled."));
    }
  }

  async function forget(item: ApprovalStatus) {
    await forgetApproval(item).catch(() => undefined);
    void load();
  }

  const open = items?.filter((item) => item.active) ?? [];
  const closed = items?.filter((item) => !item.active) ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={theme.colors.primaryBright} />}>
      <Pressable onPress={onBack}><Text style={styles.back}>‹ BACK</Text></Pressable>
      <FadeIn>
        <Text style={styles.kicker}>SELF-CLEANING APPROVALS</Text>
        <Text style={styles.title}>Open approvals</Text>
        <Text style={styles.intro}>Allowances this account granted through TREX on {network.name}, checked live on-chain. Revoke anything you no longer need; each revoke goes through the normal review and costs a small network fee.</Text>
        <Text style={styles.limit}>Only approvals made through TREX are tracked. Approvals made in other wallets will not appear here yet.</Text>
      </FadeIn>
      {items === null && <ActivityIndicator color={theme.colors.primaryBright} style={{ marginTop: 20 }} />}
      {items && open.length === 0 && (
        <View style={styles.empty}><Text style={styles.emptyTitle}>Nothing open</Text><Text style={styles.intro}>No active allowances from this account on {network.name}.</Text></View>
      )}
      {open.map((item, index) => (
        <FadeIn key={`${item.token}-${item.spender}-${item.kind}`} delay={index * 50} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.token}>{item.label}</Text>
            <Text style={[styles.amount, item.unlimited && { color: theme.colors.danger }]}>{item.amountText}</Text>
          </View>
          <Text style={styles.meta}>Spender {short(item.spender)} · {item.kind === "nft-all" ? "Collection operator" : item.kind === "permit2" ? "Permit2" : "ERC-20"}</Text>
          {item.expiresAt ? <Text style={styles.meta}>Expires {new Date(item.expiresAt * 1000).toLocaleString()}</Text> : null}
          {item.origin ? <Text style={styles.meta}>Granted to {item.origin.replace(/^https?:\/\//, "")}</Text> : null}
          {item.error ? <Text style={styles.error}>{item.error}</Text> : null}
          <View style={styles.actions}>
            {item.txHash ? <Pressable onPress={() => Linking.openURL(`${network.explorer}/tx/${item.txHash}`).catch(() => undefined)}><Text style={styles.link}>VIEW TX</Text></Pressable> : <View />}
            <SpringPressable style={styles.revoke} onPress={() => revoke(item)} disabled={!network.testnet}>
              <Text style={styles.revokeText}>{network.testnet ? "REVOKE" : "MAINNET: READ ONLY"}</Text>
            </SpringPressable>
          </View>
        </FadeIn>
      ))}
      {closed.length > 0 && <Text style={[styles.kicker, { marginTop: 22 }]}>CLOSED OR EXPIRED</Text>}
      {closed.map((item) => (
        <View key={`${item.token}-${item.spender}-${item.kind}-closed`} style={[styles.card, { opacity: 0.7 }]}>
          <View style={styles.row}><Text style={styles.token}>{item.label}</Text><Text style={styles.amount}>{item.amountText}</Text></View>
          <Text style={styles.meta}>Spender {short(item.spender)}</Text>
          <Pressable onPress={() => forget(item)}><Text style={styles.link}>REMOVE FROM LIST</Text></Pressable>
        </View>
      ))}
      {!!message && <Text style={styles.message}>{message}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { padding: 22, paddingBottom: 40 },
  back: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 24 },
  kicker: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1.6, marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: "900" },
  intro: { color: theme.colors.muted, fontSize: 11, lineHeight: 18, marginTop: 8 },
  limit: { color: theme.colors.warning, fontSize: 10, lineHeight: 16, marginTop: 8, marginBottom: 6 },
  empty: { backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 18, marginTop: 16 },
  emptyTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "800" },
  card: { backgroundColor: theme.colors.surface, borderRadius: 18, borderWidth: 1, borderColor: theme.colors.border, padding: 14, marginTop: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
  token: { color: theme.colors.text, fontSize: 14, fontWeight: "800", flexShrink: 1 },
  amount: { color: theme.colors.primaryBright, fontSize: 12, fontWeight: "800" },
  meta: { color: theme.colors.muted, fontSize: 10, marginTop: 4 },
  error: { color: theme.colors.warning, fontSize: 10, marginTop: 4 },
  actions: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  link: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 8 },
  revoke: { backgroundColor: theme.colors.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  revokeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  message: { color: theme.colors.primaryBright, fontSize: 11, lineHeight: 17, marginTop: 16 }
});
