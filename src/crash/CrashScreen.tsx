import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { CrashInfo } from "./crashStore";

// Colours inlined so the crash screen works even if the theme module failed to load.
const C = { bg: "#100804", surface: "#1B0E07", border: "#573019", primary: "#D97719", bright: "#FFB347", text: "#FFF4E6", muted: "#C2A58A", danger: "#FF6B63" };

/** Shown instead of closing when TREX hits an error it cannot recover from. Screenshot-friendly. */
export function CrashScreen({ crash, onRetry }: { crash: CrashInfo; onRetry?: () => void }) {
  const [showStack, setShowStack] = useState(false);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>TREX WALLET · ERROR</Text>
      <Text style={styles.title}>TREX hit an error</Text>
      <Text style={styles.body}>Your keys stay encrypted on this device and nothing was signed. Please screenshot this screen and send it to the developer.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>MESSAGE</Text>
        <Text selectable style={styles.message}>{crash.message}</Text>
        <Text style={styles.meta}>{crash.source.toUpperCase()} · {crash.at}</Text>
      </View>
      {!!crash.stack && (
        <Pressable onPress={() => setShowStack((v) => !v)} accessibilityRole="button">
          <Text style={styles.link}>{showStack ? "HIDE DETAILS" : "SHOW TECHNICAL DETAILS"}</Text>
        </Pressable>
      )}
      {showStack && <Text selectable style={styles.stack}>{crash.stack}</Text>}
      {onRetry && (
        <Pressable style={styles.button} onPress={onRetry} accessibilityRole="button">
          <Text style={styles.buttonText}>TRY AGAIN</Text>
        </Pressable>
      )}
      <Text style={styles.hint}>If this keeps happening, fully close TREX and open it again.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  content: { padding: 24, paddingTop: 64 },
  kicker: { color: C.bright, fontSize: 9, fontWeight: "900", letterSpacing: 1.6, marginBottom: 8 },
  title: { color: C.text, fontSize: 24, fontWeight: "900" },
  body: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 10 },
  card: { backgroundColor: C.surface, borderColor: C.danger, borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 20 },
  label: { color: C.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  message: { color: C.text, fontSize: 13, lineHeight: 19, fontWeight: "700" },
  meta: { color: C.muted, fontSize: 9, marginTop: 10 },
  link: { color: C.bright, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 16 },
  stack: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 10, fontFamily: "monospace" },
  button: { backgroundColor: C.primary, borderRadius: 14, alignItems: "center", padding: 14, marginTop: 22 },
  buttonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  hint: { color: C.muted, fontSize: 10, textAlign: "center", marginTop: 16 }
});
