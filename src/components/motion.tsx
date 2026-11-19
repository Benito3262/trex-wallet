import React, { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle
} from "react-native";
import { theme } from "../theme";

/** Shared motion tokens so every screen and sheet moves the same way. */
export const motion = {
  fast: 180,
  base: 260,
  sheet: 320,
  pressIn: { toValue: 0.95, speed: 35, bounciness: 5 },
  pressOut: { toValue: 1, speed: 28, bounciness: 7 }
} as const;

/** Fade and lift content in when it mounts (or when `trigger` changes). */
export function FadeIn({ children, delay = 0, trigger, style }: { children: ReactNode; delay?: number; trigger?: unknown; style?: StyleProp<ViewStyle> }) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    value.setValue(0);
    Animated.timing(value, { toValue: 1, duration: motion.base, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [trigger, delay, value]);
  return (
    <Animated.View style={[style, { opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** Pressable with the same spring press feedback as the wallet action tiles. */
export function SpringPressable({ children, style, containerStyle, disabled, onPressIn, onPressOut, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; containerStyle?: StyleProp<ViewStyle>; children: ReactNode }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      {...rest}
      style={containerStyle}
      disabled={disabled}
      onPressIn={(event) => { if (!disabled) Animated.spring(scale, { ...motion.pressIn, useNativeDriver: true }).start(); onPressIn?.(event); }}
      onPressOut={(event) => { Animated.spring(scale, { ...motion.pressOut, useNativeDriver: true }).start(); onPressOut?.(event); }}
    >
      <Animated.View style={[style, disabled && { opacity: 0.45 }, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/**
 * Bottom sheet: backdrop fades in while the panel slides up. Keeps the Modal
 * mounted until the exit animation finishes so it never pops out abruptly.
 */
export function BottomSheet({ visible, onClose, children, dismissable = true }: { visible: boolean; onClose: () => void; children: ReactNode; dismissable?: boolean }) {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: motion.sheet, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(progress, { toValue: 0, duration: motion.fast, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible, mounted, progress]);
  if (!mounted) return null;
  return (
    <Modal visible transparent animationType="none" onRequestClose={() => { if (dismissable) onClose(); }} statusBarTranslucent>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
          <Pressable style={styles.fill} onPress={() => { if (dismissable) onClose(); }} accessibilityLabel="Close" />
        </Animated.View>
        <Animated.View style={[styles.sheet, { transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) }] }]}>
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  backdrop: { backgroundColor: "rgba(8,4,2,0.78)" },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 20,
    paddingBottom: 26,
    paddingTop: 10,
    maxHeight: "92%",
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 18
  },
  handle: { alignSelf: "center", width: 44, height: 4, borderRadius: 2, backgroundColor: theme.colors.border, marginBottom: 14 }
});
