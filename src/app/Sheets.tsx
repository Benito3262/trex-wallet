import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { NETWORKS, MAINNET_SIGNING_BLOCKED_MESSAGE, MAINNET_SIGNING_TITLE } from "../config/networks";
import { theme } from "../theme";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { BottomSheet, SheetScrollView, enterDown } from "../components/motion";
import { haptic } from "../components/haptics";
import { setActiveAccount } from "../wallet/vault";
import { activeAccount } from "../wallet/accounts";
import { useWallet } from "./WalletContext";
import { styles } from "./homeStyles";
import { navigationRef } from "./navigationRef";

/** Network picker, account switcher and the friendly mainnet info sheet. Mounted once. */
export function AppSheets() {
  const { sheet, openSheet, network, selectChain, registry, currentAccount, setWalletAddress } = useWallet();
  const close = () => openSheet(null);
  const mainnets = NETWORKS.filter((n) => !n.testnet);
  const testnets = NETWORKS.filter((n) => n.testnet);

  const networkRow = (item: (typeof NETWORKS)[number], index: number) => {
    const selected = item.chainId === network.chainId;
    return (
      <Animated.View key={item.chainId} entering={enterDown(index)}>
        <AnimatedPressable
          style={[styles.networkOption, selected && styles.networkOptionActive]}
          pressScale={0.98}
          haptic="selection"
          accessibilityState={{ selected }}
          onPress={() => { selectChain(item.chainId); close(); }}
        >
          <View style={[local.dot, { backgroundColor: item.testnet ? theme.colors.success : theme.colors.primaryBright }]} />
          <View style={styles.networkOptionCopy}>
            <Text style={styles.networkOptionName}>{item.name}</Text>
            <Text style={styles.networkOptionMeta}>Chain {item.chainId} · {item.testnet ? "Send, receive and connect" : "Balances, tokens and connect"}</Text>
          </View>
          {selected && <Text style={styles.networkSelected}>✓</Text>}
        </AnimatedPressable>
      </Animated.View>
    );
  };

  return (
    <>
      <BottomSheet visible={sheet === "network"} onClose={close} scrollable>
        <SheetScrollView>
          <Text style={styles.modalTitle}>Choose network</Text>
          <Text style={local.group}>MAINNETS</Text>
          {mainnets.map((item, i) => networkRow(item, i))}
          <Text style={local.group}>TESTNETS · SENDING ENABLED</Text>
          {testnets.map((item, i) => networkRow(item, i + mainnets.length))}
        </SheetScrollView>
      </BottomSheet>

      <BottomSheet visible={sheet === "account"} onClose={close}>
        <Text style={styles.modalTitle}>Switch account</Text>
        <View style={{ marginTop: 10 }}>
          {registry?.accounts.map((account, index) => {
            const active = account.id === currentAccount?.id;
            return (
              <Animated.View key={account.id} entering={enterDown(index)}>
                <AnimatedPressable
                  style={[styles.networkOption, active && styles.networkOptionActive]}
                  pressScale={0.98}
                  haptic="selection"
                  onPress={() => {
                    setActiveAccount(account.id).then((next) => setWalletAddress(activeAccount(next)?.address ?? null)).catch(() => undefined);
                    close();
                  }}
                >
                  <View style={styles.networkOptionCopy}>
                    <Text style={styles.networkOptionName}>{account.name}</Text>
                    <Text style={styles.networkOptionMeta}>{account.address.slice(0, 10)}…{account.address.slice(-6)} · {account.hdIndex !== null ? `HD #${account.hdIndex}` : "Imported key"}</Text>
                  </View>
                  {active && <Text style={styles.networkSelected}>ACTIVE</Text>}
                </AnimatedPressable>
              </Animated.View>
            );
          })}
        </View>
        <AnimatedPressable style={styles.sheetButton} haptic="medium" onPress={() => { close(); if (navigationRef.isReady()) navigationRef.navigate("Wallets"); }}>
          <Text style={styles.sheetButtonText}>MANAGE, ADD OR REMOVE ACCOUNTS</Text>
        </AnimatedPressable>
      </BottomSheet>

      <BottomSheet visible={sheet === "mainnet"} onClose={close}>
        <View style={local.mainnetIcon}><Text style={local.mainnetIconText}>✦</Text></View>
        <Text style={[styles.modalTitle, { textAlign: "center" }]}>{MAINNET_SIGNING_TITLE}</Text>
        <Text style={local.body}>{MAINNET_SIGNING_BLOCKED_MESSAGE}</Text>
        <View style={local.checks}>
          <Text style={local.check}>✓  Live balances on {mainnets.map((n) => n.shortName).join(", ")}</Text>
          <Text style={local.check}>✓  Popular tokens detected automatically</Text>
          <Text style={local.check}>✓  Receive to this address on any of them</Text>
          <Text style={local.check}>✓  Connect to apps (read-only)</Text>
        </View>
        <AnimatedPressable style={styles.sheetButton} haptic="medium" onPress={() => { selectChain(11155111); haptic("success"); close(); }}>
          <Text style={styles.sheetButtonText}>SWITCH TO SEPOLIA TESTNET</Text>
        </AnimatedPressable>
        <AnimatedPressable style={local.secondary} haptic="selection" onPress={close}>
          <Text style={local.secondaryText}>GOT IT</Text>
        </AnimatedPressable>
      </BottomSheet>
    </>
  );
}

const local = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 30 },
  group: { color: theme.colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginTop: 16, marginBottom: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  mainnetIcon: { alignSelf: "center", width: 54, height: 54, borderRadius: 18, backgroundColor: "#3A1D0C", borderWidth: 1, borderColor: "#6B3B17", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  mainnetIconText: { color: theme.colors.primaryBright, fontSize: 24 },
  body: { color: theme.colors.muted, fontSize: 12, lineHeight: 19, textAlign: "center", marginTop: 8 },
  checks: { marginTop: 14, gap: 6, backgroundColor: theme.colors.background, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.colors.border },
  check: { color: theme.colors.text, fontSize: 11 },
  secondary: { alignItems: "center", padding: 14 },
  secondaryText: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", letterSpacing: 1 }
});
