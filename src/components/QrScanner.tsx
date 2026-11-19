import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Modal, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AnimatedPressable as Pressable } from "./AnimatedPressable";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { theme } from "../theme";
import { FadeIn, SpringPressable } from "./motion";
import { appLock } from "../wallet/appLock";

/**
 * Full-screen QR scanner. `onScan` returns null when the code was accepted
 * (the scanner then closes) or an error message to show while scanning continues.
 */
export function QrScanner({ visible, title, hint, onScan, onClose }: {
  visible: boolean;
  title: string;
  hint: string;
  onScan: (data: string) => string | null | Promise<string | null>;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState("");
  const [active, setActive] = useState(true);
  const locked = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setError("");
    locked.current = false;
    // Ask once when the scanner opens; after a permanent denial we show the settings route instead.
    if (permission && !permission.granted && permission.canAskAgain) askPermission();
  }, [visible, permission?.granted, permission?.canAskAgain]); // eslint-disable-line react-hooks/exhaustive-deps

  // Release the camera while the app is in the background.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => setActive(next === "active"));
    return () => sub.remove();
  }, []);

  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  function askPermission() {
    // The Android permission dialog briefly backgrounds the app; don't lock the wallet for it.
    appLock.expectSystemDialog();
    requestPermission().catch(() => undefined);
  }

  function openSettings() {
    appLock.expectSystemDialog();
    Linking.openSettings().catch(() => undefined);
  }

  async function handleScan(result: BarcodeScanningResult) {
    if (locked.current) return;
    locked.current = true;
    try {
      const problem = await onScan(result.data);
      if (problem === null) return; // accepted; parent closes the scanner
      setError(problem);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this QR code.");
    }
    // Let the user move the camera away before scanning again.
    retryTimer.current = setTimeout(() => { locked.current = false; }, 1500);
  }

  let body: React.ReactNode;
  if (!permission) {
    body = <ActivityIndicator color={theme.colors.primaryBright} style={{ marginTop: 80 }} />;
  } else if (!permission.granted) {
    body = (
      <FadeIn style={styles.permissionCard}>
        <Text style={styles.permissionTitle}>{permission.canAskAgain ? "Camera access needed" : "Camera access is off"}</Text>
        <Text style={styles.permissionText}>
          {permission.canAskAgain
            ? "TREX uses the camera only to read QR codes. Nothing is recorded or uploaded."
            : "You denied camera access. Turn it on in Android settings to scan, or close this and paste the code instead."}
        </Text>
        <SpringPressable style={styles.primary} onPress={permission.canAskAgain ? askPermission : openSettings}>
          <Text style={styles.primaryText}>{permission.canAskAgain ? "ALLOW CAMERA" : "OPEN SETTINGS"}</Text>
        </SpringPressable>
      </FadeIn>
    );
  } else {
    body = (
      <View style={styles.cameraWrap}>
        {visible && active && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={handleScan}
            onMountError={(event) => setError(event.message || "The camera could not start.")}
          />
        )}
        <View pointerEvents="none" style={styles.frame} />
      </View>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* Android modals are separate windows: gestures need their own root inside. */}
      <GestureHandlerRootView style={styles.screen}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12}><Text style={styles.close}>✕ CLOSE</Text></Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={{ width: 60 }} />
        </View>
        {body}
        <Text style={styles.hint}>{hint}</Text>
        {!!error && <FadeIn trigger={error}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></FadeIn>}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.background, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 30 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  close: { color: theme.colors.primaryBright, fontSize: 10, fontWeight: "900", letterSpacing: 1, width: 60 },
  title: { color: theme.colors.text, fontSize: 16, fontWeight: "900" },
  cameraWrap: { aspectRatio: 1, width: "100%", borderRadius: 24, overflow: "hidden", backgroundColor: "#000000", borderWidth: 1, borderColor: theme.colors.border },
  frame: { position: "absolute", top: "18%", left: "18%", right: "18%", bottom: "18%", borderWidth: 3, borderColor: theme.colors.primaryBright, borderRadius: 18, shadowColor: theme.colors.primary, shadowOpacity: 0.8, shadowRadius: 16 },
  hint: { color: theme.colors.muted, fontSize: 11, lineHeight: 18, textAlign: "center", marginTop: 18 },
  error: { color: theme.colors.danger, fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 12 },
  permissionCard: { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 20, padding: 20, marginTop: 30 },
  permissionTitle: { color: theme.colors.text, fontSize: 16, fontWeight: "900", marginBottom: 8 },
  permissionText: { color: theme.colors.muted, fontSize: 11, lineHeight: 18 },
  primary: { backgroundColor: theme.colors.primary, borderRadius: 14, alignItems: "center", paddingVertical: 14, marginTop: 18 },
  primaryText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900", letterSpacing: 1 }
});
