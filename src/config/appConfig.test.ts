/** Guards the Android permission surface: TREX must only ask for what it uses. */
import appJson from "../../app.json";

const android = appJson.expo.android as { permissions: string[]; blockedPermissions: string[] };

describe("Android permissions", () => {
  it("requests only biometrics and camera explicitly", () => {
    expect([...android.permissions].sort()).toEqual(["CAMERA", "USE_BIOMETRIC", "USE_FINGERPRINT"]);
  });
  it.each([
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "android.permission.READ_MEDIA_IMAGES",
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.RECORD_AUDIO",
    "com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE"
  ])("blocks %s", (permission) => {
    expect(android.blockedPermissions).toContain(permission);
  });
  it("never blocks what the app or its libraries need", () => {
    // DETECT_SCREEN_CAPTURE: expo-screen-capture registers an Android 14+ screen-capture
    // callback at startup, which throws SecurityException without it (the d7dcc2d launch crash).
    // VIBRATE: expo-haptics drives press feedback through the vibrator service.
    for (const needed of ["CAMERA", "INTERNET", "USE_BIOMETRIC", "USE_FINGERPRINT", "ACCESS_NETWORK_STATE", "DETECT_SCREEN_CAPTURE", "VIBRATE"]) {
      expect(android.blockedPermissions.some((p) => p.endsWith(`.${needed}`))).toBe(false);
    }
  });
  it("keeps the camera plugin from adding microphone access", () => {
    const camera = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-camera") as [string, Record<string, unknown>];
    expect(camera[1]).toMatchObject({ recordAudioAndroid: false, microphonePermission: false });
  });
});

describe("release build", () => {
  it("ships without R8 minification or resource shrinking for now", () => {
    const props = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-build-properties") as [string, { android: Record<string, unknown> }];
    expect(props[1].android).toMatchObject({ enableMinifyInReleaseBuilds: false, enableShrinkResourcesInReleaseBuilds: false });
  });
});
