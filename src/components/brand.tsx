import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from "react-native-svg";
import { theme } from "../theme";

const LOGO = require("../../assets/logo.png");

/** Official TREX Wallet logo inside a softly pulsing amber glow ring. */
export function BrandLogo({ size = 96, glow = true, style }: { size?: number; glow?: boolean; style?: ViewStyle }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!glow) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
    ]));
    loop.start();
    return () => loop.stop();
  }, [glow, pulse]);
  const ring = size + 14;
  return (
    <View style={[{ width: ring, height: ring, alignItems: "center", justifyContent: "center" }, style]}>
      {glow && (
        <Animated.View
          pointerEvents="none"
          style={[styles.glow, {
            width: ring, height: ring, borderRadius: ring / 2,
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0.95] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] }) }]
          }]}
        />
      )}
      <Image source={LOGO} accessibilityLabel="TREX Wallet logo" style={{ width: size, height: size, borderRadius: size / 2 }} />
    </View>
  );
}

/** "TREX" wordmark with the logo's silver-to-amber gradient. */
export function Wordmark({ height = 30, tagline = false }: { height?: number; tagline?: boolean }) {
  const width = height * 3.2;
  const total = tagline ? height * 1.55 : height;
  return (
    <Svg width={width} height={total} accessibilityLabel={tagline ? "TREX. Your Web3 wallet" : "TREX"}>
      <Defs>
        <LinearGradient id="trexWordmark" x1="0" y1="0" x2="1" y2="0.35">
          <Stop offset="0" stopColor="#F4F1EC" />
          <Stop offset="0.45" stopColor="#D9CFC4" />
          <Stop offset="0.72" stopColor={theme.colors.primaryBright} />
          <Stop offset="1" stopColor={theme.colors.primary} />
        </LinearGradient>
      </Defs>
      <SvgText x="0" y={height * 0.86} fill="url(#trexWordmark)" fontSize={height} fontWeight="900" fontStyle="italic" letterSpacing={height * 0.06}>
        TREX
      </SvgText>
      {tagline && (
        <SvgText x="2" y={total - 2} fill={theme.colors.muted} fontSize={height * 0.3} fontWeight="700" letterSpacing={height * 0.07}>
          YOUR WEB3 WALLET
        </SvgText>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    borderWidth: 2,
    borderColor: theme.colors.primaryBright,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.9,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
    backgroundColor: "rgba(217,119,25,0.08)"
  }
});
