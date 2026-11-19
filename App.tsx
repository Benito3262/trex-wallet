// WalletConnect polyfills (TextEncoder, crypto.getRandomValues, URL, Buffer) must load before anything else.
import "@walletconnect/react-native-compat";
import "react-native-get-random-values";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from "react-native-safe-area-context";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import Animated, { FadeIn, FadeOut, ReduceMotion, ReducedMotionConfig } from "react-native-reanimated";
import { theme } from "./src/theme";
import { WalletOnboarding } from "./src/components/WalletOnboarding";
import { WalletUnlock } from "./src/components/WalletUnlock";
import { BrandLogo, Wordmark } from "./src/components/brand";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { RequestHost } from "./src/components/RequestHost";
import { approvalQueue } from "./src/dapp/approvalCenter";
import { WalletProvider, useWallet } from "./src/app/WalletContext";
import { RootNavigator } from "./src/app/RootNavigator";
import { styles } from "./src/app/homeStyles";

// Render on the first frame instead of waiting for a native insets measurement.
const FALLBACK_METRICS = { frame: { x: 0, y: 0, width: 0, height: 0 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

export default function App() {
  return (
    <GestureHandlerRootView style={local.root}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics ?? FALLBACK_METRICS}>
        <ReducedMotionConfig mode={ReduceMotion.System} />
        <BottomSheetModalProvider>
          <StatusBar style="light" />
          <ErrorBoundary label="TREX Wallet" onError={() => approvalQueue.cancelAll()}>
            <WalletProvider>
              <Gate />
            </WalletProvider>
            <ErrorBoundary label="Request review" onError={() => approvalQueue.cancelAll()}>
              <RequestHost />
            </ErrorBoundary>
          </ErrorBoundary>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const crossfade = { entering: FadeIn.duration(260), exiting: FadeOut.duration(180) };

/** Splash → unlock → wallet, cross-faded so state changes never "pop". */
function Gate() {
  const { booting, walletAddress, walletUnlocked, setWalletAddress, setWalletUnlocked, restoreFromLock, setRestoreFromLock } = useWallet();

  if (booting) {
    return (
      <Animated.View key="splash" {...crossfade} style={local.fill}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.splash}>
            <BrandLogo size={132} />
            <View style={{ marginTop: 18 }}><Wordmark height={34} tagline /></View>
            <ActivityIndicator size="small" color={theme.colors.primaryBright} style={{ marginTop: 30 }} />
            <Text style={styles.splashStatus}>SECURING YOUR SESSION</Text>
          </View>
        </SafeAreaView>
      </Animated.View>
    );
  }

  if (walletAddress && !walletUnlocked) {
    if (restoreFromLock) {
      return (
        <Animated.View key="restore" {...crossfade} style={local.fill}>
          <SafeAreaView style={styles.safeArea}>
            <WalletOnboarding
              initialMode="import"
              purpose="restore"
              onCancel={() => setRestoreFromLock(false)}
              onComplete={(address) => { setWalletAddress(address); setWalletUnlocked(true); setRestoreFromLock(false); }}
            />
          </SafeAreaView>
        </Animated.View>
      );
    }
    return (
      <Animated.View key="unlock" {...crossfade} style={local.fill}>
        <SafeAreaView style={styles.safeArea}>
          <WalletUnlock
            onUnlocked={(address) => { setWalletAddress(address); setWalletUnlocked(true); }}
            onRestore={() => setRestoreFromLock(true)}
          />
        </SafeAreaView>
      </Animated.View>
    );
  }

  return (
    <Animated.View key="app" entering={FadeIn.duration(320)} style={local.fill}>
      <RootNavigator />
    </Animated.View>
  );
}

const local = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  fill: { flex: 1, backgroundColor: theme.colors.background }
});
