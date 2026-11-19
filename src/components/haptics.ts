import * as Haptics from "expo-haptics";

export type HapticKind = "light" | "medium" | "selection" | "success" | "warning" | "error";

/** Fire-and-forget haptic. Never throws (devices without a vibrator just ignore it). */
export function haptic(kind: HapticKind = "light"): void {
  try {
    const run =
      kind === "selection" ? Haptics.selectionAsync() :
      kind === "medium" ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium) :
      kind === "success" ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) :
      kind === "warning" ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning) :
      kind === "error" ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error) :
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    void run?.catch?.(() => undefined);
  } catch {
    // Haptics are a nicety; ignore failures.
  }
}
