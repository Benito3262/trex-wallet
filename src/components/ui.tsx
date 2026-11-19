import React, { useEffect, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from "react-native";
import Animated, { FadeIn as ReFadeIn, FadeOut as ReFadeOut, LinearTransition, ReduceMotion, useAnimatedStyle, useSharedValue, withDelay, withSpring } from "react-native-reanimated";
import { theme } from "../theme";
import { AnimatedPressable, FadeIn, SpringPressable } from "./motion";
import { haptic } from "./haptics";

/** Shared building blocks so form screens match the rest of the TREX look and motion. */

export function ScreenHeader({ title, kicker, onBack }: { title: string; kicker?: string; onBack: () => void }) {
  return (
    <FadeIn style={ui.header}>
      <AnimatedPressable onPress={onBack} hitSlop={12} haptic="selection" accessibilityLabel="Back" style={ui.backButton}><Text style={ui.back}>‹ BACK</Text></AnimatedPressable>
      {!!kicker && <Text style={ui.kicker}>{kicker}</Text>}
      <Text style={ui.title}>{title}</Text>
    </FadeIn>
  );
}

const morph = LinearTransition.springify().damping(18).stiffness(220).reduceMotion(ReduceMotion.System);

/**
 * Main call-to-action. When `busy`, the button morphs (spring layout transition) from a
 * full-width bar into a compact pill with a spinner, so a tap visibly "took" immediately.
 */
export function PrimaryButton({ label, busyLabel, busy, disabled, onPress, style }: { label: string; busyLabel?: string; busy?: boolean; disabled?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ alignItems: "center" }, style]}>
      <Animated.View layout={morph} style={busy ? ui.primaryBusyWrap : ui.primaryWrap}>
        <AnimatedPressable
          style={[ui.primary, busy && ui.primaryBusy, disabled && !busy && ui.primaryDisabled]}
          onPress={onPress}
          disabled={disabled || busy}
          haptic="medium"
          accessibilityLabel={busy ? busyLabel ?? label : label}
          accessibilityState={{ busy: !!busy, disabled: !!(disabled || busy) }}
        >
          {busy ? (
            <Animated.View key="busy" entering={ReFadeIn.duration(160)} exiting={ReFadeOut.duration(100)} style={ui.row}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              {!!busyLabel && <Text style={ui.primaryText}>{busyLabel}</Text>}
            </Animated.View>
          ) : (
            <Animated.Text key="idle" entering={ReFadeIn.duration(160)} exiting={ReFadeOut.duration(100)} style={ui.primaryText}>{label}</Animated.Text>
          )}
        </AnimatedPressable>
      </Animated.View>
    </View>
  );
}

export function GhostButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <SpringPressable style={ui.ghost} onPress={onPress} disabled={disabled} haptic="selection">
      <Text style={ui.ghostText}>{label}</Text>
    </SpringPressable>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={ui.label}>{children}</Text>;
}

export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={theme.colors.muted} autoCorrect={false} spellCheck={false} {...props} style={[ui.input, props.style]} />;
}

/** Address input with an inline QR scan button. */
export function AddressField({ value, onChangeText, onScan, placeholder = "0x..." }: { value: string; onChangeText: (value: string) => void; onScan?: () => void; placeholder?: string }) {
  return (
    <View style={ui.addressRow}>
      <Field value={value} onChangeText={onChangeText} autoCapitalize="none" placeholder={placeholder} style={{ flex: 1 }} />
      {onScan && (
        <SpringPressable style={ui.scan} onPress={onScan} accessibilityLabel="Scan QR code">
          <Text style={ui.scanIcon}>⌗</Text>
          <Text style={ui.scanText}>SCAN</Text>
        </SpringPressable>
      )}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[ui.card, style]}>{children}</View>;
}

export function Detail({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <>
      <Text style={ui.detailLabel}>{label}</Text>
      <Text selectable style={emphasis ? ui.amount : ui.detailValue}>{value}</Text>
    </>
  );
}

export function WarningPanel({ title, children, tone = "warning" }: { title: string; children: ReactNode; tone?: "warning" | "danger" }) {
  const color = tone === "danger" ? theme.colors.danger : theme.colors.warning;
  return (
    <View style={[ui.warning, { borderColor: tone === "danger" ? "#7A2A22" : "#6B3B17" }]}>
      <Text style={[ui.warningTitle, { color }]}>{title}</Text>
      {typeof children === "string" ? <Text style={ui.warningText}>{children}</Text> : children}
    </View>
  );
}

export function ErrorText({ message }: { message: string }) {
  if (!message) return null;
  return <FadeIn trigger={message}><Text accessibilityRole="alert" style={ui.error}>{message}</Text></FadeIn>;
}

export function Disclaimer({ children }: { children: string }) {
  return <Text style={ui.disclaimer}>{children}</Text>;
}

/** Success state with a springy check mark and a success haptic. */
export function SuccessCard({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  const scale = useSharedValue(0.3);
  useEffect(() => {
    scale.value = withDelay(80, withSpring(1, { damping: 9, stiffness: 180, reduceMotion: ReduceMotion.System }));
    haptic("success");
  }, [scale]);
  const checkStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <FadeIn style={[ui.card, { marginTop: 24 }]}>
      <Animated.View style={[ui.check, checkStyle]}><Text style={ui.checkText}>✓</Text></Animated.View>
      <Text style={ui.successTitle}>{title}</Text>
      <Text style={ui.body}>{body}</Text>
      {children}
    </FadeIn>
  );
}

export const ui = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 36 },
  header: { marginBottom: 16 },
  back: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 18 },
  kicker: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1.6, marginBottom: 6 },
  title: { color: theme.colors.text, fontSize: 26, fontWeight: "900" },
  body: { color: theme.colors.muted, fontSize: 11, lineHeight: 18, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { color: theme.colors.muted, fontSize: 9, fontWeight: "900", letterSpacing: 1.2, marginTop: 16, marginBottom: 7 },
  input: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.sm, paddingHorizontal: 13, paddingVertical: 13, color: theme.colors.text, fontSize: 12 },
  addressRow: { flexDirection: "row", alignItems: "stretch", gap: 8 },
  scan: { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.sm, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", height: "100%", minHeight: 46 },
  scanIcon: { color: theme.colors.primaryBright, fontSize: 16, fontWeight: "900" },
  scanText: { color: theme.colors.primaryBright, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  backButton: { alignSelf: "flex-start", paddingVertical: 4, paddingRight: 12 },
  primaryWrap: { alignSelf: "stretch", marginTop: 20 },
  primaryBusyWrap: { alignSelf: "center", marginTop: 20 },
  primary: { backgroundColor: theme.colors.primary, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingVertical: 15, paddingHorizontal: 22, minHeight: 52, shadowColor: theme.colors.primaryBright, shadowOpacity: 0.45, shadowRadius: 16, elevation: 6 },
  primaryBusy: { borderRadius: 26, minWidth: 52, backgroundColor: "#B8620F" },
  primaryDisabled: { opacity: 0.45 },
  primaryText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  ghost: { alignItems: "center", padding: 14 },
  ghostText: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  card: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.md, padding: 16, marginTop: 16 },
  cardTitle: { color: theme.colors.text, fontSize: 15, fontWeight: "900", marginBottom: 4 },
  readOnly: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.sm, padding: 13 },
  readOnlyText: { color: theme.colors.text, fontSize: 12, fontWeight: "700" },
  detailLabel: { color: theme.colors.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1, marginTop: 11, marginBottom: 4 },
  detailValue: { color: theme.colors.text, fontSize: 10, lineHeight: 16 },
  amount: { color: theme.colors.primaryBright, fontSize: 22, fontWeight: "900" },
  warning: { backgroundColor: theme.colors.surfaceRaised, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 14 },
  warningTitle: { fontSize: 10, fontWeight: "900", marginBottom: 6, letterSpacing: 0.4 },
  warningText: { color: theme.colors.muted, fontSize: 10, lineHeight: 17 },
  error: { color: theme.colors.danger, fontSize: 11, lineHeight: 17, marginTop: 14 },
  disclaimer: { color: "#8F6B4B", fontSize: 8, textAlign: "center", letterSpacing: 1, marginTop: 28 },
  check: { width: 54, height: 54, borderRadius: 27, backgroundColor: "#17372F", borderColor: theme.colors.success, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  checkText: { color: theme.colors.success, fontSize: 26, fontWeight: "900" },
  successTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "900", marginBottom: 8 },
  sheetTitle: { color: theme.colors.text, fontSize: 18, fontWeight: "900", marginBottom: 2 },
  sheetKicker: { color: theme.colors.primaryBright, fontSize: 9, fontWeight: "900", letterSpacing: 1.6, marginBottom: 6 }
});
