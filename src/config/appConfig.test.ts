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
    "android.permission.VIBRATE",
    "android.permission.ACCESS_WIFI_STATE",
    "android.permission.DETECT_SCREEN_CAPTURE",
    "android.permission.RECORD_AUDIO",
    "com.google.android.finsky.permission.BIND_GET_INSTALL_REFERRER_SERVICE"
  ])("blocks %s", (permission) => {
    expect(android.blockedPermissions).toContain(permission);
  });
  it("never blocks what the app needs", () => {
    for (const needed of ["CAMERA", "INTERNET", "USE_BIOMETRIC", "USE_FINGERPRINT", "ACCESS_NETWORK_STATE"]) {
      expect(android.blockedPermissions.some((p) => p.endsWith(`.${needed}`))).toBe(false);
    }
  });
  it("keeps the camera plugin from adding microphone access", () => {
    const camera = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === "expo-camera") as [string, Record<string, unknown>];
    expect(camera[1]).toMatchObject({ recordAudioAndroid: false, microphonePermission: false });
  });
});
