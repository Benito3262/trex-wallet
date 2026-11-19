import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { createBottomTabNavigator, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import Animated, { interpolate, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { NETWORKS } from "../config/networks";
import { theme } from "../theme";
import { BrandLogo, Wordmark } from "../components/brand";
import { AnimatedPressable } from "../components/AnimatedPressable";
import { CountUpText, GlowOrb, ShineSweep, Skeleton, SkeletonRow, enterDown, motion } from "../components/motion";
import { haptic } from "../components/haptics";
import { DappBrowser } from "../components/DappBrowser";
import { CalldataAnalyzer } from "../components/CalldataAnalyzer";
import { removeCustomToken } from "../wallet/tokenStore";
import { useWallet } from "./WalletContext";
import { useActivity, useNativeBalance, useTokens, type WalletToken } from "./useWalletData";
import { styles } from "./homeStyles";
import type { RootStackParamList } from "./types";

type Nav = StackNavigationProp<RootStackParamList>;

function formatAmount(n: number, max = 6) {
  return n.toLocaleString("en-US", { maximumFractionDigits: max });
}

/** Pull-to-refresh state that ends only after the reload it started has finished. */
function usePullRefresh(loading: boolean, reload: () => void) {
  const [refreshing, setRefreshing] = useState(false);
  const sawLoading = useRef(false);
  useEffect(() => {
    if (!refreshing) return;
    if (loading) { sawLoading.current = true; return; }
    if (sawLoading.current) { sawLoading.current = false; setRefreshing(false); return; }
    const fallback = setTimeout(() => setRefreshing(false), 1200); // nothing to reload
    return () => clearTimeout(fallback);
  }, [refreshing, loading]);
  const onRefresh = useCallback(() => { sawLoading.current = false; setRefreshing(true); haptic("light"); reload(); }, [reload]);
  return { refreshing, onRefresh };
}

function HomeHeader() {
  const { currentAccount, walletAddress, network, openSheet } = useWallet();
  return (
    <View style={styles.header}>
      <View style={styles.brandRow}>
        <BrandLogo size={34} glow={false} />
        <View>
          <Wordmark height={22} />
          <Text style={styles.brandCaption}>YOUR WEB3 WALLET</Text>
        </View>
      </View>
      <View style={styles.headerActions}>
        <AnimatedPressable style={styles.accountButton} onPress={() => openSheet("account")} disabled={!walletAddress} haptic="selection" accessibilityLabel="Switch account">
          <Text style={styles.accountButtonText} numberOfLines={1}>{currentAccount ? currentAccount.name.toUpperCase() : "ACCOUNT"} ⌄</Text>
        </AnimatedPressable>
        <AnimatedPressable style={styles.networkPill} onPress={() => openSheet("network")} haptic="selection" accessibilityLabel={`Network: ${network.name}. Change network`}>
          <View style={[styles.networkDot, !network.testnet && { backgroundColor: theme.colors.primaryBright }]} />
          <Text style={styles.networkText}>{network.shortName}</Text>
          <Text style={styles.chevron}>⌄</Text>
        </AnimatedPressable>
      </View>
    </View>
  );
}

function ActionTile({ icon, label, onPress, disabled = false, index }: { icon: string; label: string; onPress: () => void; disabled?: boolean; index: number }) {
  return (
    <Animated.View entering={enterDown(index + 2)} style={{ flex: 1 }}>
      <AnimatedPressable accessibilityLabel={label} disabled={disabled} onPress={onPress} pressScale={0.92} haptic="light" style={[styles.actionTile, local.actionTile, disabled && styles.disabled]}>
        <View style={local.actionIconWrap}><Text style={styles.actionIcon}>{icon}</Text></View>
        <Text style={styles.actionLabel}>{label}</Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

function HeroCard({ balance }: { balance: ReturnType<typeof useNativeBalance> }) {
  const { walletAddress, network, balanceHidden, toggleBalanceHidden } = useWallet();
  const showSkeleton = !!walletAddress && balance.loading && balance.value === null;
  return (
    <Animated.View entering={enterDown(0)} style={local.heroShadow}>
      <LinearGradient colors={["#3B1B08", "#1E0F07", "#2A140A"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.balanceCard, local.hero]}>
        <GlowOrb size={240} style={{ top: -110, right: -80 }} />
        <ShineSweep />
        <View style={styles.cardTopRow}>
          <Text style={styles.eyebrow}>{network.testnet ? "TESTNET BALANCE" : "TOTAL BALANCE"}</Text>
          <AnimatedPressable onPress={toggleBalanceHidden} haptic="selection" hitSlop={10} accessibilityLabel={balanceHidden ? "Show balance" : "Hide balance"}>
            <Text style={styles.eye}>{balanceHidden ? "◉" : "◎"}</Text>
          </AnimatedPressable>
        </View>
        {showSkeleton ? (
          <View style={{ marginTop: 16, marginBottom: 6 }}><Skeleton width="62%" height={34} radius={10} /></View>
        ) : balanceHidden ? (
          <Text style={styles.balance}>••••••</Text>
        ) : !walletAddress ? (
          <Text style={styles.balance}>0.00</Text>
        ) : balance.value !== null ? (
          <View style={local.balanceRow}>
            <CountUpText value={balance.value} format={(n) => formatAmount(n)} style={styles.balance} />
            <Text style={local.balanceSymbol}>{network.symbol}</Text>
          </View>
        ) : (
          <View style={{ marginTop: 13 }}>
            <Text style={[styles.balance, { marginTop: 0, fontSize: 26, color: theme.colors.muted }]}>— {network.symbol}</Text>
            {!!balance.error && <Text style={local.balanceError}>{balance.error}</Text>}
          </View>
        )}
        <Text style={styles.balanceFootnote}>{walletAddress ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}` : "No wallet connected yet"}</Text>
        <View style={styles.cardDivider} />
        <View style={styles.addressRow}>
          <View>
            <Text style={styles.eyebrow}>ACTIVE NETWORK</Text>
            <Text style={styles.networkName}>{network.name}</Text>
          </View>
          <View style={[styles.chainBadge, !network.testnet && local.mainnetBadge]}><Text style={styles.chainBadgeText}>{network.testnet ? "TESTNET" : "MAINNET"} · {network.chainId}</Text></View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

function TokenRow({ token, index, onPress, onRemove }: { token: WalletToken; index: number; onPress: () => void; onRemove?: () => void }) {
  const label = token.source === "known" ? "Verified token list" : token.source === "indexed" ? "Auto-discovered · Unverified" : "Added by you · Unverified";
  const amount = Number(token.balance);
  return (
    <Animated.View entering={enterDown(index + 4)} style={local.tokenCard}>
      <AnimatedPressable style={styles.tokenRowBody} onPress={onPress} pressScale={0.98} accessibilityLabel={`${token.name}, ${token.balance} ${token.symbol}`}>
        <View style={styles.tokenSymbolBubble}><Text style={styles.tokenSymbolText}>{token.symbol.slice(0, 4).toUpperCase()}</Text></View>
        <View style={styles.tokenDetails}>
          <Text style={styles.tokenNameText} numberOfLines={1}>{token.name}</Text>
          <Text style={styles.tokenMetaText}>{token.symbol} · {label}</Text>
        </View>
        <Text style={styles.tokenBalanceText}>{Number.isFinite(amount) ? formatAmount(amount, 4) : token.balance}</Text>
      </AnimatedPressable>
      {onRemove && (
        <AnimatedPressable onPress={onRemove} hitSlop={8} haptic="selection" accessibilityLabel={`Remove ${token.symbol}`}>
          <Text style={styles.removeToken}>×</Text>
        </AnimatedPressable>
      )}
    </Animated.View>
  );
}

function WalletTab() {
  const navigation = useNavigation<Nav>();
  const wallet = useWallet();
  const { walletAddress, network, tokenRefreshKey, openSheet, bumpTokens } = wallet;
  const balance = useNativeBalance(network, walletAddress, tokenRefreshKey);
  const tokens = useTokens(network, walletAddress, tokenRefreshKey);
  const { refreshing, onRefresh } = usePullRefresh(balance.loading || tokens.loading, bumpTokens);

  const send = () => { if (!network.testnet) openSheet("mainnet"); else navigation.navigate("Send"); };
  const openToken = (token: WalletToken) => {
    if (!network.testnet) { openSheet("mainnet"); return; }
    navigation.navigate("SendToken", { token: { chainId: token.chainId, contractAddress: token.contractAddress, name: token.name, symbol: token.symbol, decimals: token.decimals } });
  };
  const removeToken = (token: WalletToken) => Alert.alert("Remove token?", `Remove ${token.symbol} from this device's asset list?`, [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: () => { removeCustomToken(network.chainId, token.contractAddress).then(bumpTokens).catch(() => undefined); } }
  ]);

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <HomeHeader />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primaryBright} colors={[theme.colors.primary]} progressBackgroundColor={theme.colors.surfaceRaised} />}
      >
        <HeroCard balance={balance} />

        <View style={styles.actions}>
          {walletAddress ? (
            <ActionTile index={0} icon="↗" label="Send" onPress={send} />
          ) : (
            <ActionTile index={0} icon="＋" label="Create wallet" onPress={() => navigation.navigate("Setup")} />
          )}
          <ActionTile index={1} icon="↙" label="Receive" onPress={() => navigation.navigate("Receive")} disabled={!walletAddress} />
          <ActionTile index={2} icon="⇄" label="Connect" onPress={() => navigation.navigate("WalletConnect", {})} disabled={!walletAddress} />
          <ActionTile index={3} icon="◈" label="Wallets" onPress={() => navigation.navigate("Wallets")} disabled={!walletAddress} />
        </View>

        {!network.testnet && walletAddress && (
          <Animated.View entering={enterDown(5)}>
            <AnimatedPressable style={local.mainnetHint} onPress={() => openSheet("mainnet")} pressScale={0.98} haptic="selection">
              <Text style={local.mainnetHintIcon}>✦</Text>
              <Text style={local.mainnetHintText}>Mainnet balances are live. Sending on mainnet is coming soon. Tap to learn more.</Text>
            </AnimatedPressable>
          </Animated.View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Assets</Text>
          {walletAddress && (
            <AnimatedPressable onPress={() => navigation.navigate("AddToken")} haptic="selection" hitSlop={8} accessibilityLabel="Add token">
              <Text style={[styles.sectionMeta, { color: theme.colors.primaryBright, fontWeight: "800" }]}>+ ADD TOKEN</Text>
            </AnimatedPressable>
          )}
        </View>

        {walletAddress && tokens.loading && tokens.tokens.length === 0 ? (
          <View>{[0, 1, 2].map((i) => <SkeletonRow key={i} />)}</View>
        ) : tokens.tokens.length === 0 ? (
          <Animated.View entering={enterDown(5)} style={styles.emptyCard}>
            <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>◇</Text></View>
            <Text style={styles.emptyTitle}>{walletAddress ? "No token balances yet" : "Your assets will appear here"}</Text>
            <Text style={styles.emptyText}>{walletAddress ? "TREX checks popular tokens on this network automatically. Add any other token by its contract address." : "Create or import a wallet to see balances and tokens across your EVM networks."}</Text>
          </Animated.View>
        ) : tokens.tokens.map((token, index) => (
          <TokenRow key={`${network.chainId}:${token.contractAddress}`} token={token} index={index} onPress={() => openToken(token)} onRemove={token.source === "manual" ? () => removeToken(token) : undefined} />
        ))}

        <Animated.View entering={enterDown(8)} style={styles.securityBanner}>
          <View style={styles.shield}><Text style={styles.shieldText}>✦</Text></View>
          <View style={styles.securityCopy}>
            <Text style={styles.securityTitle}>Security comes first</Text>
            <Text style={styles.securityText}>Every transfer shows the recipient, amount and network fee before you approve it with biometrics.</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ActivityTab() {
  const { walletAddress, network, activityRefreshKey, bumpActivity } = useWallet();
  const focused = useIsFocused();
  const activity = useActivity(network, walletAddress, focused, activityRefreshKey);
  const { refreshing, onRefresh } = usePullRefresh(activity.loading, bumpActivity);
  const local_tx = activity.transactions.filter((tx) => !activity.chainActivity.some((item) => item.hash.toLowerCase() === tx.hash.toLowerCase()));
  const showSkeleton = activity.loading && !activity.loadedOnce;
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <HomeHeader />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 110 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primaryBright} colors={[theme.colors.primary]} progressBackgroundColor={theme.colors.surfaceRaised} />}
      >
        <Text style={styles.sectionTitle}>Activity</Text>
        <Text style={styles.securityIntro}>Transfers for {walletAddress ? `${walletAddress.slice(0, 8)}…${walletAddress.slice(-6)}` : "this wallet"} on {network.name}. Pull down to refresh.</Text>
        {!!activity.notice && <Animated.View entering={enterDown(0)} style={local.infoNotice}><Text style={local.infoNoticeText}>{activity.notice}</Text></Animated.View>}
        {showSkeleton ? (
          <View>{[0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)}</View>
        ) : activity.chainActivity.length === 0 && local_tx.length === 0 ? (
          <Animated.View entering={enterDown(1)} style={styles.emptyCard}>
            <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>↻</Text></View>
            <Text style={styles.emptyTitle}>No activity yet</Text>
            <Text style={styles.emptyText}>Transfers you send or receive on {network.name} will show up here.</Text>
          </Animated.View>
        ) : (
          <>
            {activity.chainActivity.map((tx, index) => (
              <Animated.View entering={enterDown(index)} key={`${tx.hash}:${tx.kind}:${tx.tokenAddress ?? index}`} style={styles.transactionRow}>
                <View style={[styles.transactionIcon, tx.direction === "received" && styles.receivedIcon]}><Text style={styles.transactionIconText}>{tx.direction === "received" ? "↙" : "↗"}</Text></View>
                <View style={styles.transactionCopy}>
                  <Text style={styles.transactionTitle}>{tx.direction === "received" ? "Received" : "Sent"} {tx.amount} {tx.symbol}</Text>
                  <Text style={styles.transactionMeta}>{tx.kind === "token" ? "Token transfer" : "Native transfer"} · {tx.status === "failed" ? "Failed" : "Confirmed"} · {new Date(tx.timestamp).toLocaleString()}</Text>
                  <AnimatedPressable onPress={() => Linking.openURL(`${network.explorer}/tx/${tx.hash}`).catch(() => undefined)} haptic="selection" style={{ alignSelf: "flex-start" }}><Text style={styles.transactionHash}>{tx.hash.slice(0, 12)}…{tx.hash.slice(-8)} · VIEW</Text></AnimatedPressable>
                </View>
              </Animated.View>
            ))}
            {local_tx.map((tx, index) => (
              <Animated.View entering={enterDown(activity.chainActivity.length + index)} key={tx.hash} style={styles.transactionRow}>
                <View style={styles.transactionIcon}><Text style={styles.transactionIconText}>↗</Text></View>
                <View style={styles.transactionCopy}>
                  <Text style={styles.transactionTitle}>Sent {tx.amount} {tx.symbol}</Text>
                  <Text style={styles.transactionMeta}>{tx.networkName} · {tx.status === "included" ? "Included in block" : tx.status === "failed" ? "Failed" : "Submitted"}</Text>
                  <AnimatedPressable onPress={() => { const chain = NETWORKS.find((item) => item.chainId === tx.chainId); if (chain) Linking.openURL(`${chain.explorer}/tx/${tx.hash}`).catch(() => undefined); }} haptic="selection" style={{ alignSelf: "flex-start" }}><Text style={styles.transactionHash}>{tx.hash.slice(0, 12)}…{tx.hash.slice(-8)} · VIEW</Text></AnimatedPressable>
                </View>
              </Animated.View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const SECURITY_ITEMS: [string, string, string, string][] = [
  ["01", "Transfer preflight", "Checks address format, chain ID, balance and estimated gas before you sign.", "ACTIVE"],
  ["02", "Encrypted local vault", "Recovery phrase protected by Android secure storage and biometrics.", "ACTIVE"],
  ["03", "Recovery screen privacy", "Blocks screenshots and screen recording while words are visible.", "ACTIVE"],
  ["04", "Request review", "Decodes approvals, setApprovalForAll and Permit/Permit2 signatures, simulates with eth_call, checks balance plus fee, contract vs EOA, first interactions and chain mismatches.", "ACTIVE"],
  ["05", "Self-cleaning approvals", "Offers an exact amount instead of unlimited approvals, tracks what you granted and lets you revoke in one tap.", "TESTNET"],
  ["06", "Mainnet sending", "Coming soon. Mainnet balances, tokens and app connections already work; signing stays on testnets during early testing.", "SOON"],
  ["07", "Calldata decoder", "Paste calldata below to inspect it offline.", "ACTIVE"]
];

function SecurityTab() {
  const navigation = useNavigation<Nav>();
  const { walletAddress } = useWallet();
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <HomeHeader />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 110 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.securityPage}>
          <Text style={styles.sectionTitle}>TREX protection</Text>
          <Text style={styles.securityIntro}>Every site request opens a review sheet with decoded calldata, a best-effort simulation and risk checks, then asks for biometrics. Checks can miss things; they are not a guarantee.</Text>
          <Animated.View entering={enterDown(0)} style={styles.securityLinks}>
            <AnimatedPressable style={styles.securityLink} onPress={() => navigation.navigate("Approvals")} disabled={!walletAddress}>
              <Text style={styles.securityLinkTitle}>Open approvals</Text>
              <Text style={styles.securityItemText}>See and revoke allowances granted through TREX.</Text>
            </AnimatedPressable>
            <AnimatedPressable style={styles.securityLink} onPress={() => navigation.navigate("Sites")} disabled={!walletAddress}>
              <Text style={styles.securityLinkTitle}>Connected sites</Text>
              <Text style={styles.securityItemText}>Review and disconnect dApps.</Text>
            </AnimatedPressable>
          </Animated.View>
          <Animated.View entering={enterDown(1)}>
            <AnimatedPressable style={[styles.securityLink, { marginBottom: 8 }]} onPress={() => navigation.navigate("WalletConnect", {})} disabled={!walletAddress}>
              <Text style={styles.securityLinkTitle}>WalletConnect</Text>
              <Text style={styles.securityItemText}>Pair with a dApp on another device by scanning or pasting its wc: link.</Text>
            </AnimatedPressable>
          </Animated.View>
          {SECURITY_ITEMS.map(([number, title, description, status], index) => (
            <Animated.View entering={enterDown(index + 2)} key={number} style={styles.securityItem}>
              <Text style={styles.securityNumber}>{number}</Text>
              <View style={styles.securityItemCopy}>
                <Text style={styles.securityItemTitle}>{title}</Text>
                <Text style={styles.securityItemText}>{description}</Text>
              </View>
              <Text style={[styles.pending, status === "ACTIVE" && { color: theme.colors.success }]}>{status}</Text>
            </Animated.View>
          ))}
          <CalldataAnalyzer />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BrowserTab() {
  const navigation = useNavigation<Nav>();
  const { walletAddress, walletUnlocked } = useWallet();
  if (!walletAddress || !walletUnlocked) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <HomeHeader />
        <View style={styles.tabEmpty}>
          <Text style={styles.tabEmptyIcon}>◎</Text>
          <Text style={styles.emptyTitle}>Browse dApps with TREX</Text>
          <Text style={styles.emptyText}>Create or import a wallet first, then open any web3 site here and connect safely.</Text>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safeArea}>
      <DappBrowser onClose={() => navigation.navigate("Home", { screen: "Wallet" })} />
    </SafeAreaView>
  );
}

const TAB_ICONS: Record<string, string> = { Wallet: "◇", Activity: "↻", Security: "⬡", Browser: "◎" };

function TabItem({ label, focused, onPress }: { label: string; focused: boolean; onPress: () => void }) {
  const active = useSharedValue(focused ? 1 : 0);
  useEffect(() => { active.value = withSpring(focused ? 1 : 0, motion.spring); }, [focused, active]);
  const iconStyle = useAnimatedStyle(() => ({
    color: interpolateColor(active.value, [0, 1], [theme.colors.muted, theme.colors.primaryBright]),
    transform: [{ scale: interpolate(active.value, [0, 1], [1, 1.22]) }, { translateY: interpolate(active.value, [0, 1], [0, -2]) }]
  }));
  const labelStyle = useAnimatedStyle(() => ({ color: interpolateColor(active.value, [0, 1], [theme.colors.muted, theme.colors.primaryBright]) }));
  return (
    <AnimatedPressable style={styles.navItem} onPress={onPress} haptic="selection" pressScale={0.9} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: focused }}>
      <Animated.Text style={[styles.navIcon, iconStyle]}>{TAB_ICONS[label] ?? "•"}</Animated.Text>
      <Animated.Text style={[styles.navLabel, labelStyle]}>{label}</Animated.Text>
    </AnimatedPressable>
  );
}

/** Tab bar with a spring-sliding amber indicator and scaling icons. */
function TrexTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [width, setWidth] = useState(0);
  const count = state.routes.length;
  const itemWidth = width / count;
  const x = useSharedValue(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!itemWidth) return;
    const target = state.index * itemWidth;
    x.value = reduce ? target : withSpring(target, { damping: 20, stiffness: 240, mass: 0.7 });
  }, [state.index, itemWidth, x, reduce]);
  const indicator = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const focusedName = state.routes[state.index]?.name;
  if (focusedName === "Browser") return null;
  return (
    <View style={[local.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={local.tabRow} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Animated.View pointerEvents="none" style={[local.indicatorSlot, { width: itemWidth }, indicator]}>
            <View style={local.indicatorPill} />
            <View style={local.indicatorBar} />
          </Animated.View>
        )}
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          return (
            <View key={route.key} style={{ flex: 1, alignItems: "center" }}>
              <TabItem
                label={route.name}
                focused={focused}
                onPress={() => {
                  const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                }}
              />
            </View>
          );
        })}
      </View>
      <Text style={styles.disclaimer}>EARLY TEST BUILD · NOT AUDITED · SENDING ON TESTNETS ONLY</Text>
    </View>
  );
}

const Tabs = createBottomTabNavigator();

export function HomeTabs() {
  const reduce = useReducedMotion();
  return (
    <Tabs.Navigator
      tabBar={(props) => <TrexTabBar {...props} />}
      screenOptions={{ headerShown: false, animation: reduce ? "none" : "shift", sceneStyle: { backgroundColor: theme.colors.background } }}
    >
      <Tabs.Screen name="Wallet" component={WalletTab} />
      <Tabs.Screen name="Activity" component={ActivityTab} />
      <Tabs.Screen name="Security" component={SecurityTab} />
      <Tabs.Screen name="Browser" component={BrowserTab} />
    </Tabs.Navigator>
  );
}

const local = StyleSheet.create({
  heroShadow: { borderRadius: 25, shadowColor: theme.colors.primary, shadowOpacity: 0.45, shadowRadius: 26, shadowOffset: { width: 0, height: 10 }, elevation: 12, backgroundColor: theme.colors.surface },
  hero: { overflow: "hidden", borderColor: "#7A4219" },
  balanceRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  balanceSymbol: { color: theme.colors.primaryBright, fontSize: 16, fontWeight: "900", marginBottom: 7 },
  balanceError: { color: theme.colors.warning, fontSize: 10, lineHeight: 15, marginTop: 6 },
  mainnetBadge: { backgroundColor: "#3A2408", borderWidth: 1, borderColor: "#7A4219" },
  actionTile: { shadowColor: theme.colors.primary, shadowOpacity: 0.18, shadowRadius: 10, elevation: 3 },
  actionIconWrap: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#3A1D0C", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#6B3B17" },
  mainnetHint: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, backgroundColor: "#211006", borderColor: "#6B3B17", borderWidth: 1, borderRadius: 14, padding: 12 },
  mainnetHintIcon: { color: theme.colors.primaryBright, fontSize: 14 },
  mainnetHintText: { flex: 1, color: theme.colors.muted, fontSize: 10, lineHeight: 15 },
  tokenCard: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8, backgroundColor: theme.colors.surface, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border },
  infoNotice: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  infoNoticeText: { color: theme.colors.muted, fontSize: 10, lineHeight: 16 },
  tabBar: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: "rgba(16,8,4,0.97)", borderTopWidth: 1, borderTopColor: theme.colors.border, paddingTop: 8 },
  tabRow: { flexDirection: "row", alignItems: "center", height: 54 },
  indicatorSlot: { position: "absolute", top: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center" },
  indicatorPill: { width: 64, height: 48, borderRadius: 16, backgroundColor: "#2A160B", borderWidth: 1, borderColor: "#6B3B17", shadowColor: theme.colors.primaryBright, shadowOpacity: 0.5, shadowRadius: 12, elevation: 6 },
  indicatorBar: { position: "absolute", top: -8, width: 26, height: 3, borderRadius: 2, backgroundColor: theme.colors.primaryBright }
});
