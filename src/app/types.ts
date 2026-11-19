import type { NavigatorScreenParams } from "@react-navigation/native";
import type { TokenMetadata } from "../wallet/tokens";

export type HomeTabParamList = {
  Wallet: undefined;
  Activity: undefined;
  Security: undefined;
  Browser: undefined;
};

export type RootStackParamList = {
  Home: NavigatorScreenParams<HomeTabParamList> | undefined;
  Send: undefined;
  SendToken: { token: TokenMetadata };
  AddToken: undefined;
  Receive: undefined;
  Wallets: undefined;
  AddWallet: undefined;
  Approvals: undefined;
  Sites: undefined;
  WalletConnect: { uri?: string };
  Setup: undefined;
};
