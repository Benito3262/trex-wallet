import "react-native-get-random-values";
import React, { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import { DEFAULT_NETWORK, NETWORKS } from "./src/config/networks";
import { theme } from "./src/theme";
import { WalletOnboarding } from "./src/components/WalletOnboarding";
import { WalletUnlock } from "./src/components/WalletUnlock";
import { getWalletAddress } from "./src/wallet/vault";
import { getNativeBalance } from "./src/wallet/balances";
import { refreshRecentTransactions, type WalletTransaction } from "./src/wallet/history";
import { ReceiveAddress } from "./src/components/ReceiveAddress";
import { SendNative } from "./src/components/SendNative";
import { AddToken } from "./src/components/AddToken";
import { SendToken } from "./src/components/SendToken";
import { getCustomTokens } from "./src/wallet/tokenStore";
import { inspectErc20Token } from "./src/wallet/tokens";
import type { TokenBalance, TokenMetadata } from "./src/wallet/tokens";

type Tab = "Wallet" | "Activity" | "Security";

function ActionTile({ icon, label, onPress, disabled = false }: {
  icon: string;
  label: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionTile, pressed && !disabled && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  const [networkIndex, setNetworkIndex] = useState(
    NETWORKS.findIndex((network) => network.chainId === DEFAULT_NETWORK.chainId)
  );
  const [balanceHidden, setBalanceHidden] = useState(true);
  const [tab, setTab] = useState<Tab>("Wallet");
  const [setupOpen, setSetupOpen] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletUnlocked, setWalletUnlocked] = useState(false);
  const [nativeBalance, setNativeBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [sendOpen, setSendOpen] = useState(false);
  const [addTokenOpen, setAddTokenOpen] = useState(false);
  const [tokenRefreshKey, setTokenRefreshKey] = useState(0);
  const [customTokens, setCustomTokens] = useState<TokenBalance[]>([]);
  const [selectedToken, setSelectedToken] = useState<TokenMetadata | null>(null);
  const network = useMemo(() => NETWORKS[networkIndex] ?? DEFAULT_NETWORK, [networkIndex]);

  useEffect(() => {
    if (!walletAddress) { setNativeBalance(null); return; }
    let active = true;
    setBalanceLoading(true);
    getNativeBalance(network, walletAddress)
      .then((value) => { if (active) setNativeBalance(value); })
      .catch(() => { if (active) setNativeBalance(null); })
      .finally(() => { if (active) setBalanceLoading(false); });
    return () => { active = false; };
  }, [walletAddress, network]);

  useEffect(() => {
    if (!walletAddress) { setCustomTokens([]); return; }
    let active = true;
    getCustomTokens(network.chainId)
      .then(async (saved) => {
        const balances = await Promise.all(saved.map(async (token) => {
          try {
            return await inspectErc20Token(network, token.contractAddress, walletAddress);
          } catch {
            return { ...token, balance: "Unavailable" };
          }
        }));
        if (active) setCustomTokens(balances);
      })
      .catch(() => { if (active) setCustomTokens([]); });
    return () => { active = false; };
  }, [walletAddress, network, tokenRefreshKey]);

  useEffect(() => {
    let mounted = true;
    getWalletAddress().then((address) => { if (mounted && address) setWalletAddress(address); }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  if (selectedToken && walletAddress) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <SendToken address={walletAddress} network={network} token={selectedToken} onBack={() => setSelectedToken(null)} onSent={() => { refreshRecentTransactions().then(setTransactions).catch(() => undefined); setSelectedToken(null); setTab("Activity"); }} />
      </SafeAreaView>
    );
  }

  if (addTokenOpen && walletAddress) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <AddToken network={network} walletAddress={walletAddress} onBack={() => setAddTokenOpen(false)} onAdded={() => { setAddTokenOpen(false); setTokenRefreshKey((value) => value + 1); }} />
      </SafeAreaView>
    );
  }

  if (sendOpen && walletAddress) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <SendNative address={walletAddress} network={network} onBack={() => setSendOpen(false)} onSent={() => { refreshRecentTransactions().then(setTransactions).catch(() => undefined); setSendOpen(false); setTab("Activity"); }} />
      </SafeAreaView>
    );
  }

  if (receiveOpen && walletAddress) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <ReceiveAddress address={walletAddress} network={network} onBack={() => setReceiveOpen(false)} />
      </SafeAreaView>
    );
  }

  if (setupOpen) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <WalletOnboarding
          onCancel={() => setSetupOpen(false)}
          onComplete={(address) => { setWalletAddress(address); setWalletUnlocked(true); setSetupOpen(false); setTab("Wallet"); }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>TREX<Text style={styles.brandAccent}>.</Text></Text>
            <Text style={styles.brandCaption}>YOUR EVM WALLET</Text>
          </View>
          <Pressable style={styles.networkPill} onPress={() => setNetworkIndex((networkIndex + 1) % NETWORKS.length)}>
            <View style={styles.networkDot} />
            <Text style={styles.networkText}>{network.shortName}</Text>
            <Text style={styles.chevron}>⌄</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {tab === "Wallet" && (
            <>
              <View style={styles.balanceCard}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.eyebrow}>TOTAL PORTFOLIO</Text>
                  <Pressable onPress={() => setBalanceHidden(!balanceHidden)} accessibilityLabel={balanceHidden ? "Show balance" : "Hide balance"}>
                    <Text style={styles.eye}>{balanceHidden ? "◉" : "◎"}</Text>
                  </Pressable>
                </View>
                <Text style={styles.balance}>{balanceHidden ? "••••••••" : walletAddress ? balanceLoading ? "Loading..." : nativeBalance ? `${nativeBalance} ${network.symbol}` : "Unavailable" : "0.00"}</Text>
                <Text style={styles.balanceFootnote}>{walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}` : "No wallet connected yet"}</Text>
                <View style={styles.cardDivider} />
                <View style={styles.addressRow}>
                  <View>
                    <Text style={styles.eyebrow}>ACTIVE NETWORK</Text>
                    <Text style={styles.networkName}>{network.name}</Text>
                  </View>
                  <View style={styles.chainBadge}><Text style={styles.chainBadgeText}>CHAIN {network.chainId}</Text></View>
                </View>
              </View>

              {walletAddress && !walletUnlocked && <WalletUnlock onUnlocked={(address) => { setWalletAddress(address); setWalletUnlocked(true); }} />}

              <View style={styles.actions}>
                <ActionTile icon="＋" label={walletAddress ? (walletUnlocked ? "Wallet ready" : "Unlock") : "Create wallet"} onPress={() => walletAddress ? undefined : setSetupOpen(true)} disabled={!!walletAddress} />
                <ActionTile icon="↗" label={network.chainId === 11155111 || network.chainId === 84532 ? "Send" : "Testnet only"} onPress={() => setSendOpen(true)} disabled={!walletAddress || (network.chainId !== 11155111 && network.chainId !== 84532)} />
                <ActionTile icon="↙" label="Receive" onPress={() => setReceiveOpen(true)} disabled={!walletAddress} />
                <ActionTile icon="⇄" label="Swap" disabled />
              </View>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Assets</Text>
                <Pressable onPress={() => setAddTokenOpen(true)} disabled={!walletAddress}>
                  <Text style={styles.sectionMeta}>{walletAddress ? "+ ADD TOKEN" : network.name}</Text>
                </Pressable>
              </View>
              {customTokens.length === 0 ? (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>◇</Text></View>
                  <Text style={styles.emptyTitle}>{walletAddress ? "No custom tokens added" : "Your assets will appear here"}</Text>
                  <Text style={styles.emptyText}>{walletAddress ? "Add an ERC-20 contract address to read its balance on this network." : "Create or import a wallet to see balances and tokens across your EVM networks."}</Text>
                </View>
              ) : customTokens.map((token) => (
                <Pressable key={token.contractAddress} style={styles.tokenRow} disabled={network.chainId !== 11155111 && network.chainId !== 84532} onPress={() => setSelectedToken(token)}>
                  <View style={styles.tokenSymbolBubble}><Text style={styles.tokenSymbolText}>{token.symbol.slice(0, 3).toUpperCase()}</Text></View>
                  <View style={styles.tokenDetails}>
                    <Text style={styles.tokenNameText}>{token.name}</Text>
                    <Text style={styles.tokenMetaText}>{token.symbol} · {network.chainId === 11155111 || network.chainId === 84532 ? "Tap to send · Unverified" : "Unverified contract"}</Text>
                  </View>
                  <Text style={styles.tokenBalanceText}>{token.balance}</Text>
                </Pressable>
              ))}

              <View style={styles.securityBanner}>
                <View style={styles.shield}><Text style={styles.shieldText}>✦</Text></View>
                <View style={styles.securityCopy}>
                  <Text style={styles.securityTitle}>Security comes first</Text>
                  <Text style={styles.securityText}>Native testnet transfers show the recipient, amount and gas estimate before signing.</Text>
                </View>
              </View>
            </>
          )}

          {tab === "Activity" && (
            <View style={styles.securityPage}>
              <Text style={styles.sectionTitle}>Transaction activity</Text>
              <Text style={styles.securityIntro}>Locally recorded transactions submitted from this device. A submitted transaction is not necessarily confirmed.</Text>
              {transactions.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>No transactions yet</Text>
                  <Text style={styles.emptyText}>Your submitted transfers will appear here.</Text>
                </View>
              ) : transactions.map((tx) => (
                <View key={tx.hash} style={styles.transactionRow}>
                  <View style={styles.transactionIcon}><Text style={styles.transactionIconText}>↗</Text></View>
                  <View style={styles.transactionCopy}>
                    <Text style={styles.transactionTitle}>Sent {tx.amount} {tx.symbol}</Text>
                    <Text style={styles.transactionMeta}>{tx.networkName} · {tx.status === "included" ? "Included in block" : tx.status === "failed" ? "Failed" : "Submitted"}</Text>
                    <Text selectable style={styles.transactionHash}>{tx.hash.slice(0, 12)}...{tx.hash.slice(-8)}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {tab === "Security" && (
            <View style={styles.securityPage}>
              <Text style={styles.sectionTitle}>TREX protection</Text>
              <Text style={styles.securityIntro}>Current protections cover wallet storage and native testnet transfers. Contract-level risk analysis is still under development.</Text>
              {[
                ["01", "Native transfer preflight", "Check address syntax, chain ID, balance and estimated gas.", "TESTNET"],
                ["02", "Encrypted local vault", "Recovery phrase protected by Android secure storage and biometrics.", "ACTIVE"],
                ["03", "Recovery screen privacy", "Block screenshots and screen recording while words are visible.", "ACTIVE"],
                ["04", "Contract risk engine", "Decode token approvals, Permit signatures and suspicious contract calls.", "PLANNED"]
              ].map(([number, title, description, status]) => (
                <View key={number} style={styles.securityItem}>
                  <Text style={styles.securityNumber}>{number}</Text>
                  <View style={styles.securityItemCopy}>
                    <Text style={styles.securityItemTitle}>{title}</Text>
                    <Text style={styles.securityItemText}>{description}</Text>
                  </View>
                  <Text style={styles.pending}>{status}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={styles.bottomNav}>
          {(["Wallet", "Activity", "Security"] as Tab[]).map((item) => (
            <Pressable key={item} style={styles.navItem} onPress={() => setTab(item)}>
              <Text style={[styles.navIcon, tab === item && styles.navActive]}>{item === "Wallet" ? "◇" : item === "Activity" ? "↻" : "⬡"}</Text>
              <Text style={[styles.navLabel, tab === item && styles.navActive]}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.disclaimer}>EARLY PREVIEW · DO NOT USE WITH REAL FUNDS</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.background },
  page: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: 22, paddingTop: 10, paddingBottom: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { color: theme.colors.text, fontSize: 29, fontWeight: "900", letterSpacing: 2.2 },
  brandAccent: { color: theme.colors.primaryBright },
  brandCaption: { color: theme.colors.muted, fontSize: 8, fontWeight: "700", letterSpacing: 2.1, marginTop: -2 },
  networkPill: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 30, paddingVertical: 10, paddingHorizontal: 13 },
  networkDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: theme.colors.success },
  networkText: { color: theme.colors.text, fontSize: 12, fontWeight: "700" },
  chevron: { color: theme.colors.muted, fontSize: 16, marginTop: -4 },
  content: { paddingHorizontal: 20, paddingBottom: 18 },
  balanceCard: { backgroundColor: theme.colors.surface, borderRadius: 25, padding: 22, borderWidth: 1, borderColor: theme.colors.border },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { color: theme.colors.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.6 },
  eye: { color: theme.colors.primaryBright, fontSize: 19 },
  balance: { color: theme.colors.text, fontSize: 36, fontWeight: "800", letterSpacing: 1, marginTop: 13 },
  balanceFootnote: { color: theme.colors.muted, fontSize: 11, marginTop: 5 },
  cardDivider: { height: 1, backgroundColor: theme.colors.border, marginVertical: 20 },
  addressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  networkName: { color: theme.colors.text, fontSize: 14, fontWeight: "700", marginTop: 6 },
  chainBadge: { backgroundColor: "#2A1C3D", paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  chainBadgeText: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  actions: { flexDirection: "row", gap: 10, marginTop: 18 },
  actionTile: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, paddingVertical: 15, gap: 8 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.42 },
  actionIcon: { color: theme.colors.primaryBright, fontSize: 22, fontWeight: "500" },
  actionLabel: { color: theme.colors.text, fontSize: 9, fontWeight: "700" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 30, marginBottom: 13 },
  sectionTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "800" },
  sectionMeta: { color: theme.colors.muted, fontSize: 10 },
  emptyCard: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 20, padding: 23, alignItems: "center" },
  emptyIcon: { width: 46, height: 46, borderRadius: 16, backgroundColor: "#2A1C3D", alignItems: "center", justifyContent: "center", marginBottom: 13 },
  emptyIconText: { color: theme.colors.primaryBright, fontSize: 26 },
  emptyTitle: { color: theme.colors.text, fontSize: 14, fontWeight: "800", textAlign: "center" },
  emptyText: { color: theme.colors.muted, fontSize: 11, lineHeight: 18, textAlign: "center", marginTop: 7, maxWidth: 270 },
  securityBanner: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 17, backgroundColor: "#171326", borderRadius: 17, padding: 15, borderWidth: 1, borderColor: "#38234F" },
  shield: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#34204C", alignItems: "center", justifyContent: "center" },
  shieldText: { color: theme.colors.primaryBright, fontSize: 18 },
  securityCopy: { flex: 1 },
  securityTitle: { color: theme.colors.text, fontSize: 12, fontWeight: "800" },
  securityText: { color: theme.colors.muted, fontSize: 10, marginTop: 4 },
  tabEmpty: { flex: 1, minHeight: 400, alignItems: "center", justifyContent: "center", paddingHorizontal: 25 },
  tabEmptyIcon: { color: theme.colors.primaryBright, fontSize: 40, marginBottom: 14 },
  securityPage: { paddingTop: 12 },
  securityIntro: { color: theme.colors.muted, fontSize: 12, lineHeight: 19, marginTop: 8, marginBottom: 20 },
  securityItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 17, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  securityNumber: { color: theme.colors.primaryBright, fontSize: 12, fontWeight: "900" },
  securityItemCopy: { flex: 1 },
  securityItemTitle: { color: theme.colors.text, fontSize: 12, fontWeight: "800" },
  securityItemText: { color: theme.colors.muted, fontSize: 10, marginTop: 4 },
  pending: { color: theme.colors.warning, fontSize: 8, fontWeight: "900", letterSpacing: 0.6 },
  bottomNav: { flexDirection: "row", justifyContent: "space-around", paddingTop: 13, paddingBottom: 8, borderTopWidth: 1, borderTopColor: theme.colors.border, backgroundColor: theme.colors.background },
  navItem: { alignItems: "center", gap: 4, minWidth: 70 },
  navIcon: { color: theme.colors.muted, fontSize: 19 },
  navLabel: { color: theme.colors.muted, fontSize: 9, fontWeight: "700" },
  navActive: { color: theme.colors.primaryBright },
  tokenRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  tokenSymbolBubble: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#2A1C3D", alignItems: "center", justifyContent: "center" },
  tokenSymbolText: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900" },
  tokenDetails: { flex: 1 },
  tokenNameText: { color: theme.colors.text, fontSize: 12, fontWeight: "800" },
  tokenMetaText: { color: theme.colors.muted, fontSize: 9, marginTop: 4 },
  tokenBalanceText: { color: theme.colors.text, fontSize: 11, fontWeight: "700" },
  transactionRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  transactionIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#2A1C3D", alignItems: "center", justifyContent: "center" },
  transactionIconText: { color: theme.colors.primaryBright, fontSize: 17 },
  transactionCopy: { flex: 1 },
  transactionTitle: { color: theme.colors.text, fontSize: 12, fontWeight: "800" },
  transactionMeta: { color: theme.colors.muted, fontSize: 9, marginTop: 4 },
  transactionHash: { color: theme.colors.primaryBright, fontSize: 9, marginTop: 4 },
  disclaimer: { color: "#766C87", fontSize: 8, textAlign: "center", letterSpacing: 1.1, paddingBottom: 5, paddingTop: 3 }
});
