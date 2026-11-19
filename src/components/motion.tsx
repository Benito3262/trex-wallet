import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming
} from "react-native-reanimated";
import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps
} from "@gorhom/bottom-sheet";
import { LinearGradient } from "expo-linear-gradient";
import { theme } from "../theme";
import { AnimatedPressable, type AnimatedPressableProps } from "./AnimatedPressable";

export { AnimatedPressable } from "./AnimatedPressable";
export type { AnimatedPressableProps } from "./AnimatedPressable";

/** Shared motion tokens so every screen and sheet moves the same way. */
export const motion = {
  fast: 180,
  base: 260,
  stagger: 45,
  spring: { damping: 18, stiffness: 220, mass: 0.8 },
  sheetSpring: { damping: 22, stiffness: 260, mass: 0.9, overshootClamping: false, reduceMotion: ReduceMotion.System }
} as const;

/** Entering animation for list rows: fade + lift, staggered by index. Respects reduce motion. */
export function enterDown(index = 0) {
  return FadeInDown.delay(Math.min(index, 12) * motion.stagger).springify().damping(18).stiffness(180).reduceMotion(ReduceMotion.System);
}

/** Fade and lift content in when it mounts (or again when `trigger` changes). */
export function FadeIn({ children, delay = 0, trigger, style }: { children: ReactNode; delay?: number; trigger?: unknown; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View key={trigger === undefined ? undefined : String(trigger)} entering={FadeInDown.delay(delay).springify().damping(18).stiffness(180).reduceMotion(ReduceMotion.System)} style={style}>
      {children}
    </Animated.View>
  );
}

/** AnimatedPressable with a separate outer container style (kept for older call sites). */
export function SpringPressable({ children, style, containerStyle, disabled, ...rest }: Omit<AnimatedPressableProps, "style" | "children"> & { style?: StyleProp<ViewStyle>; containerStyle?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <View style={containerStyle}>
      <AnimatedPressable {...rest} disabled={disabled} style={[style, disabled && { opacity: 0.45 }]}>
        {children}
      </AnimatedPressable>
    </View>
  );
}

const SheetBackdrop = (dismissable: boolean) => function Backdrop(props: BottomSheetBackdropProps) {
  return <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.72} pressBehavior={dismissable ? "close" : "none"} />;
};

/**
 * Gesture-driven bottom sheet: springs open, follows the finger, drag down (or tap the
 * backdrop) to dismiss, backdrop fades with the sheet position. Same API as before.
 * Pass `scrollable` when the content is long; then use SheetScrollView inside.
 */
export function BottomSheet({ visible, onClose, children, dismissable = true, scrollable = false }: { visible: boolean; onClose: () => void; children: ReactNode; dismissable?: boolean; scrollable?: boolean }) {
  const ref = useRef<BottomSheetModal>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const reduce = useReducedMotion();
  useEffect(() => {
    if (visible) ref.current?.present();
    else ref.current?.dismiss();
  }, [visible]);
  const backdrop = useMemo(() => SheetBackdrop(dismissable), [dismissable]);
  const animationConfigs = useMemo(() => (reduce ? { duration: 1, reduceMotion: ReduceMotion.Never } : motion.sheetSpring), [reduce]);
  const handleDismiss = useCallback(() => { if (visibleRef.current) onCloseRef.current(); }, []);
  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose={dismissable}
      onDismiss={handleDismiss}
      backdropComponent={backdrop}
      backgroundStyle={styles.sheet}
      handleIndicatorStyle={styles.handle}
      animationConfigs={animationConfigs}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      topInset={48}
    >
      {scrollable ? children : <BottomSheetView style={styles.content}>{children}</BottomSheetView>}
    </BottomSheetModal>
  );
}

/** Scroll container for long sheet content (use with `<BottomSheet scrollable>`). */
export function SheetScrollView({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <BottomSheetScrollView style={style} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {children}
    </BottomSheetScrollView>
  );
}

/** TextInput that keeps a bottom sheet above the keyboard. */
export const SheetTextInput = BottomSheetTextInput;

/** Last non-null value, so a sheet keeps showing its content while it animates closed. */
export function useLingering<T>(value: T | null | undefined): T | null {
  const last = useRef<T | null>(null);
  if (value !== null && value !== undefined) last.current = value;
  return value ?? last.current;
}

/** Shimmering placeholder while data loads. Static when reduce motion is on. */
export function Skeleton({ width = "100%", height = 14, radius = 8, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const progress = useSharedValue(0);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (reduce) return;
    progress.value = withRepeat(withTiming(1, { duration: 1150, easing: Easing.inOut(Easing.quad) }), -1, false);
    return () => cancelAnimation(progress);
  }, [reduce, progress]);
  const sweep = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(progress.value, [0, 1], [-w, w]) }] }));
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={[{ width, height, borderRadius: radius, backgroundColor: theme.colors.surfaceRaised, overflow: "hidden" }, style]}>
      {!reduce && w > 0 && (
        <Animated.View style={[StyleSheet.absoluteFill, sweep]}>
          <LinearGradient colors={["rgba(255,179,71,0)", "rgba(255,179,71,0.16)", "rgba(255,179,71,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
    </View>
  );
}

/** Row-shaped skeleton for token and activity lists. */
export function SkeletonRow() {
  return (
    <View style={styles.skeletonRow}>
      <Skeleton width={36} height={36} radius={12} />
      <View style={{ flex: 1, gap: 7 }}>
        <Skeleton width="55%" height={11} />
        <Skeleton width="35%" height={9} />
      </View>
      <Skeleton width={56} height={11} />
    </View>
  );
}

/** Number that counts up/down to its new value (ease-out), e.g. balances. */
export function CountUpText({ value, format, style, duration = 700 }: { value: number; format: (n: number) => string; style?: StyleProp<TextStyle>; duration?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const from = useRef(reduce ? value : 0);
  useEffect(() => {
    if (reduce || !Number.isFinite(value)) { setShown(value); from.current = value; return; }
    const start = Date.now();
    const origin = from.current;
    let frame: ReturnType<typeof requestAnimationFrame> | null = null;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + (value - origin) * eased;
      setShown(t >= 1 ? value : next);
      if (t < 1) frame = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => { if (frame !== null) cancelAnimationFrame(frame); from.current = value; };
  }, [value, duration, reduce]);
  return <Text style={style}>{format(shown)}</Text>;
}

/** Slow breathing amber glow used behind the hero card and brand marks. */
export function GlowOrb({ size = 220, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  const reduce = useReducedMotion();
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduce) return;
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 2600, easing: Easing.inOut(Easing.sin) })), -1, false);
    return () => cancelAnimation(pulse);
  }, [reduce, pulse]);
  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.22, 0.42]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.92, 1.08]) }]
  }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, overflow: "hidden" }, animated, style]}>
      <LinearGradient colors={["rgba(255,179,71,0.85)", "rgba(217,119,25,0.35)", "rgba(217,119,25,0)"]} start={{ x: 0.5, y: 0.5 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

/** Diagonal light sweep across a card every few seconds. */
export function ShineSweep() {
  const reduce = useReducedMotion();
  const x = useSharedValue(0);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (reduce) return;
    x.value = withRepeat(withSequence(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.cubic) }), withTiming(1, { duration: 2600 }), withTiming(0, { duration: 0 })), -1, false);
    return () => cancelAnimation(x);
  }, [reduce, x]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: interpolate(x.value, [0, 1], [-w, w * 1.2]) }, { rotate: "18deg" }] }));
  if (reduce) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <Animated.View style={[{ position: "absolute", top: -40, bottom: -40, width: w * 0.35 }, animated]}>
          <LinearGradient colors={["rgba(255,244,230,0)", "rgba(255,244,230,0.08)", "rgba(255,244,230,0)"]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: theme.colors.border
  },
  content: { paddingHorizontal: 20, paddingBottom: 30, paddingTop: 4 },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: theme.colors.border },
  skeletonRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 12, marginBottom: 8, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border }
});
