import React, { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { AccessibilityActionEvent, Insets, StyleProp, ViewProps, ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { haptic as fireHaptic, type HapticKind } from "./haptics";

export type PressState = { pressed: boolean };

export type AnimatedPressableProps = Omit<ViewProps, "style" | "children" | "hitSlop"> & {
  onPress?: () => void;
  onLongPress?: () => void;
  onPressIn?: () => void;
  onPressOut?: () => void;
  disabled?: boolean | null;
  style?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>);
  children?: ReactNode | ((state: PressState) => ReactNode);
  hitSlop?: number | Insets;
  /** Haptic on a completed press. false for none. */
  haptic?: HapticKind | false;
  /** Scale while held. */
  pressScale?: number;
};

const RELEASE = { damping: 14, stiffness: 320, mass: 0.6 };

/**
 * The one touchable used everywhere in TREX. Press feedback (spring scale + dim) runs as a
 * worklet on the UI thread the instant a finger lands, so it never waits for a busy JS
 * thread. The press itself and a light haptic are delivered to JS on release.
 */
export function AnimatedPressable(props: AnimatedPressableProps) {
  const {
    onPress, onLongPress, onPressIn, onPressOut, disabled, style, children, hitSlop,
    haptic = "light", pressScale = 0.96, accessibilityRole = "button", accessibilityState, accessible = true, testID,
    ...rest
  } = props;
  const latest = useRef(props);
  latest.current = props;
  const pressed = useSharedValue(0);
  const wantsJsPressed = typeof style === "function" || typeof children === "function";
  const [pressedJs, setPressedJs] = useState(false);
  const wantsRef = useRef(wantsJsPressed);
  wantsRef.current = wantsJsPressed;

  const handlePress = useCallback(() => {
    const p = latest.current;
    if (p.disabled) return;
    if (p.haptic !== false) fireHaptic(p.haptic ?? "light");
    p.onPress?.();
  }, []);
  const handleLongPress = useCallback(() => {
    const p = latest.current;
    if (p.disabled || !p.onLongPress) return;
    fireHaptic("medium");
    p.onLongPress();
  }, []);
  const handleIn = useCallback(() => { latest.current.onPressIn?.(); if (wantsRef.current) setPressedJs(true); }, []);
  const handleOut = useCallback(() => { latest.current.onPressOut?.(); if (wantsRef.current) setPressedJs(false); }, []);

  const hasLongPress = !!onLongPress;
  const isDisabled = !!disabled;
  const gesture = useMemo(() => {
    let tap = Gesture.Tap()
      .enabled(!isDisabled)
      .maxDuration(60_000)
      .maxDistance(14)
      .onBegin(() => {
        pressed.value = withTiming(1, { duration: 90 });
        runOnJS(handleIn)();
      })
      .onEnd((_event, success) => {
        if (success) runOnJS(handlePress)();
      })
      .onFinalize(() => {
        pressed.value = withSpring(0, RELEASE);
        runOnJS(handleOut)();
      });
    if (hitSlop !== undefined) tap = tap.hitSlop(hitSlop);
    if (testID) tap = tap.withTestId(testID);
    if (!hasLongPress) return tap;
    const long = Gesture.LongPress()
      .enabled(!isDisabled)
      .minDuration(450)
      .onStart(() => { runOnJS(handleLongPress)(); });
    if (hitSlop !== undefined) long.hitSlop(hitSlop);
    return Gesture.Exclusive(long, tap);
  }, [isDisabled, hasLongPress, hitSlop, testID, pressed, handleIn, handleOut, handlePress, handleLongPress]);

  const animated = useAnimatedStyle(() => ({
    opacity: interpolate(pressed.value, [0, 1], [1, 0.82]),
    transform: [{ scale: interpolate(pressed.value, [0, 1], [1, pressScale]) }]
  }));

  const state = { pressed: pressedJs };
  const resolvedStyle = typeof style === "function" ? style(state) : style;
  const resolvedChildren = typeof children === "function" ? children(state) : children;

  const onAccessibilityAction = useCallback((event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === "activate") handlePress();
    else if (event.nativeEvent.actionName === "longpress") handleLongPress();
  }, [handlePress, handleLongPress]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        {...rest}
        testID={testID}
        accessible={accessible}
        accessibilityRole={accessibilityRole}
        accessibilityState={{ disabled: isDisabled, ...accessibilityState }}
        accessibilityActions={hasLongPress ? [{ name: "activate" }, { name: "longpress" }] : [{ name: "activate" }]}
        onAccessibilityAction={onAccessibilityAction}
        style={[resolvedStyle, animated]}
      >
        {resolvedChildren}
      </Animated.View>
    </GestureDetector>
  );
}
