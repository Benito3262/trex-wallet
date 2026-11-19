import React, { useEffect } from "react";
import { DarkTheme, NavigationContainer, type Theme } from "@react-navigation/native";
import { CardStyleInterpolators, TransitionPresets, createStackNavigator, type StackScreenProps } from "@react-navigation/stack";
import { useReducedMotion } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "../theme";
import { SendNative } from "../components/SendNative";
import { SendToken } from "../components/SendToken";
import { AddToken } from "../components/AddToken";
import { ReceiveAddress } from "../components/ReceiveAddress";
import { WalletManager } from "../components/WalletManager";
import { WalletOnboarding } from "../components/WalletOnboarding";
import { OpenApprovals } from "../components/OpenApprovals";
import { ConnectedSites } from "../components/ConnectedSites";
import { WalletConnectScreen } from "../components/WalletConnectScreen";
import { disconnectOriginSessions } from "../walletconnect/service";
import { useWallet } from "./WalletContext";
import { HomeTabs } from "./HomeTabs";
import { AppSheets } from "./Sheets";
import { navigationRef } from "./navigationRef";
import { styles } from "./homeStyles";
import type { RootStackParamList } from "./types";

const Stack = createStackNavigator<RootStackParamList>();

const navTheme: Theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, primary: theme.colors.primary, background: theme.colors.background, card: theme.colors.surface, text: theme.colors.text, border: theme.colors.border, notification: theme.colors.primaryBright }
};

type P<K extends keyof RootStackParamList> = StackScreenProps<RootStackParamList, K>;

function Screen({ children }: { children: React.ReactNode }) {
  return <SafeAreaView style={styles.safeArea}>{children}</SafeAreaView>;
}

/** Renders `children` only while a wallet exists; otherwise returns to Home. */
function useNeedsWallet(navigation: P<keyof RootStackParamList>["navigation"]) {
  const { walletAddress } = useWallet();
  useEffect(() => { if (!walletAddress && navigation.canGoBack()) navigation.popToTop(); }, [walletAddress, navigation]);
  return walletAddress;
}

function SendScreen({ navigation }: P<"Send">) {
  const { network, bumpActivity, bumpTokens } = useWallet();
  const address = useNeedsWallet(navigation);
  if (!address) return null;
  return <Screen><SendNative address={address} network={network} onBack={() => navigation.goBack()} onSent={() => { bumpActivity(); bumpTokens(); }} /></Screen>;
}

function SendTokenScreen({ navigation, route }: P<"SendToken">) {
  const { network, bumpActivity, bumpTokens } = useWallet();
  const address = useNeedsWallet(navigation);
  if (!address) return null;
  return <Screen><SendToken address={address} network={network} token={route.params.token} onBack={() => navigation.goBack()} onSent={() => { bumpActivity(); bumpTokens(); }} /></Screen>;
}

function AddTokenScreen({ navigation }: P<"AddToken">) {
  const { network, bumpTokens } = useWallet();
  const address = useNeedsWallet(navigation);
  if (!address) return null;
  return <Screen><AddToken network={network} walletAddress={address} onBack={() => navigation.goBack()} onAdded={() => { bumpTokens(); navigation.goBack(); }} /></Screen>;
}

function ReceiveScreen({ navigation }: P<"Receive">) {
  const { network } = useWallet();
  const address = useNeedsWallet(navigation);
  if (!address) return null;
  return <Screen><ReceiveAddress address={address} network={network} onBack={() => navigation.goBack()} /></Screen>;
}

function WalletsScreen({ navigation }: P<"Wallets">) {
  const { setWalletAddress, setWalletUnlocked } = useWallet();
  const address = useNeedsWallet(navigation);
  if (!address) return null;
  return (
    <Screen>
      <WalletManager
        onBack={() => navigation.goBack()}
        onAddWallet={() => navigation.navigate("AddWallet")}
        onActiveChanged={(next) => {
          setWalletAddress(next);
          if (!next) { setWalletUnlocked(false); navigation.popToTop(); }
        }}
      />
    </Screen>
  );
}

function AddWalletScreen({ navigation }: P<"AddWallet">) {
  const { setWalletAddress } = useWallet();
  return (
    <Screen>
      <WalletOnboarding purpose="add" onCancel={() => navigation.goBack()} onComplete={(address) => { setWalletAddress(address); navigation.goBack(); }} />
    </Screen>
  );
}

function SetupScreen({ navigation }: P<"Setup">) {
  const { setWalletAddress, setWalletUnlocked } = useWallet();
  return (
    <Screen>
      <WalletOnboarding
        purpose="setup"
        onCancel={() => navigation.goBack()}
        onComplete={(address) => { setWalletAddress(address); setWalletUnlocked(true); navigation.popToTop(); }}
      />
    </Screen>
  );
}

function ApprovalsScreen({ navigation }: P<"Approvals">) {
  const { network } = useWallet();
  const address = useNeedsWallet(navigation);
  if (!address) return null;
  return <Screen><OpenApprovals address={address} network={network} onBack={() => navigation.goBack()} /></Screen>;
}

function SitesScreen({ navigation }: P<"Sites">) {
  const address = useNeedsWallet(navigation);
  if (!address) return null;
  return <Screen><ConnectedSites address={address} onBack={() => navigation.goBack()} onDisconnectWalletConnect={disconnectOriginSessions} /></Screen>;
}

function WalletConnectRoute({ navigation, route }: P<"WalletConnect">) {
  const address = useNeedsWallet(navigation);
  if (!address) return null;
  return <Screen><WalletConnectScreen initialUri={route.params?.uri ?? null} onBack={() => navigation.goBack()} /></Screen>;
}

/** Opens deep-linked WalletConnect pairings once the navigator is ready and the wallet is unlocked. */
function DeepLinkBridge() {
  const { pendingWcUri, takePendingWcUri, walletAddress, walletUnlocked } = useWallet();
  useEffect(() => {
    if (!pendingWcUri || !walletAddress || !walletUnlocked || !navigationRef.isReady()) return;
    const uri = takePendingWcUri();
    if (uri) navigationRef.navigate("WalletConnect", { uri });
  }, [pendingWcUri, walletAddress, walletUnlocked, takePendingWcUri]);
  return null;
}

export function RootNavigator() {
  const reduce = useReducedMotion();
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          ...(reduce ? {} : TransitionPresets.SlideFromRightIOS),
          cardStyleInterpolator: reduce ? CardStyleInterpolators.forNoAnimation : CardStyleInterpolators.forHorizontalIOS,
          gestureEnabled: true,
          gestureDirection: "horizontal",
          gestureResponseDistance: 60,
          cardOverlayEnabled: true,
          cardStyle: { backgroundColor: theme.colors.background }
        }}
      >
        <Stack.Screen name="Home" component={HomeTabs} />
        <Stack.Screen name="Send" component={SendScreen} />
        <Stack.Screen name="SendToken" component={SendTokenScreen} />
        <Stack.Screen name="AddToken" component={AddTokenScreen} />
        <Stack.Screen name="Receive" component={ReceiveScreen} />
        <Stack.Screen name="Wallets" component={WalletsScreen} />
        <Stack.Screen name="AddWallet" component={AddWalletScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="Approvals" component={ApprovalsScreen} />
        <Stack.Screen name="Sites" component={SitesScreen} />
        <Stack.Screen name="WalletConnect" component={WalletConnectRoute} />
        <Stack.Screen name="Setup" component={SetupScreen} options={reduce ? { gestureEnabled: false } : { ...TransitionPresets.ModalSlideFromBottomIOS, gestureEnabled: false }} />
      </Stack.Navigator>
      <DeepLinkBridge />
      <AppSheets />
    </NavigationContainer>
  );
}
