import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Text } from "react-native";
import { GestureHandlerRootView, State } from "react-native-gesture-handler";
import { fireGestureHandler, getByGestureTestId } from "react-native-gesture-handler/jest-utils";
import * as Haptics from "expo-haptics";
import { AnimatedPressable } from "./AnimatedPressable";

const TAP = [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }];

describe("AnimatedPressable", () => {
  it("fires onPress with a light haptic on a completed tap", () => {
    const onPress = jest.fn();
    act(() => { TestRenderer.create(<GestureHandlerRootView><AnimatedPressable testID="send" onPress={onPress}><Text>Send</Text></AnimatedPressable></GestureHandlerRootView>); });
    act(() => { fireGestureHandler(getByGestureTestId("send"), TAP); });
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalled();
  });

  it("does nothing while disabled and exposes the disabled state", () => {
    const onPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<GestureHandlerRootView><AnimatedPressable testID="off" disabled onPress={onPress}><Text>Off</Text></AnimatedPressable></GestureHandlerRootView>); });
    act(() => { fireGestureHandler(getByGestureTestId("off"), TAP); });
    expect(onPress).not.toHaveBeenCalled();
    const view = renderer.root.findAll((node) => node.props.accessibilityRole === "button")[0];
    expect(view.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it("supports accessibility activation and style functions", () => {
    const onPress = jest.fn();
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => { renderer = TestRenderer.create(<GestureHandlerRootView><AnimatedPressable testID="a11y" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}><Text>Go</Text></AnimatedPressable></GestureHandlerRootView>); });
    const view = renderer.root.findAll((node) => node.props.accessibilityRole === "button")[0];
    act(() => { view.props.onAccessibilityAction({ nativeEvent: { actionName: "activate" } }); });
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
