import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

type Props = { children: React.ReactNode; onError?: (error: Error) => void; label?: string };
type State = { error: Error | null };

/** Catches render errors so one broken screen cannot crash the whole wallet. Never logs secrets. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    try { this.props.onError?.(error); } catch { /* ignore */ }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.screen}>
        <Text style={styles.kicker}>{(this.props.label ?? "TREX Wallet").toUpperCase()}</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>This screen hit an unexpected error. Your keys are safe on this device and nothing was signed. Try again, and if it keeps happening, restart the app.</Text>
        <Pressable style={styles.button} onPress={() => this.setState({ error: null })} accessibilityRole="button">
          <Text style={styles.buttonText}>TRY AGAIN</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background, padding: 28, justifyContent: "center" },
  kicker: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1.6, marginBottom: 8 },
  title: { color: theme.colors.text, fontSize: 24, fontWeight: "900" },
  body: { color: theme.colors.muted, fontSize: 12, lineHeight: 19, marginTop: 10 },
  button: { backgroundColor: theme.colors.primary, borderRadius: 14, alignItems: "center", padding: 14, marginTop: 22 },
  buttonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", letterSpacing: 1 }
});
