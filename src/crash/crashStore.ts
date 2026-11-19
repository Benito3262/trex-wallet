/**
 * Holds the last fatal JS error so the crash screen can show it instead of the app
 * closing. Depends on nothing but plain JS so it can load before every other module.
 */
export type CrashInfo = { message: string; stack: string; source: "startup" | "render" | "global"; at: string };

let current: CrashInfo | null = null;
const listeners = new Set<(crash: CrashInfo | null) => void>();

const MAX_MESSAGE = 600;
const MAX_STACK = 1500;
// Defensive: long hex runs or 12+ word lowercase sequences are blanked in case a library echoes input.
const SECRETISH = /\b(0x)?[0-9a-fA-F]{60,}\b|\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/g;

export function sanitize(text: string, max: number): string {
  return text.replace(SECRETISH, "[redacted]").slice(0, max);
}

export function toCrashInfo(error: unknown, source: CrashInfo["source"]): CrashInfo {
  // Errors from another realm (or plain objects) fail instanceof; read message/stack structurally.
  const like = error as { name?: unknown; message?: unknown; stack?: unknown } | null;
  const err = error instanceof Error
    ? error
    : like && typeof like === "object" && typeof like.message === "string"
      ? { name: typeof like.name === "string" ? like.name : "Error", message: like.message, stack: typeof like.stack === "string" ? like.stack : undefined }
      : new Error(typeof error === "string" ? error : "Unknown error");
  return {
    message: sanitize(`${err.name && err.name !== "Error" ? `${err.name}: ` : ""}${err.message || "Unknown error"}`, MAX_MESSAGE),
    stack: sanitize(err.stack ?? "", MAX_STACK),
    source,
    at: new Date().toISOString()
  };
}

export function reportCrash(error: unknown, source: CrashInfo["source"]): CrashInfo {
  current = toCrashInfo(error, source);
  listeners.forEach((listener) => { try { listener(current); } catch { /* ignore */ } });
  return current;
}

export function clearCrash() {
  current = null;
  listeners.forEach((listener) => { try { listener(null); } catch { /* ignore */ } });
}

export function getCrash(): CrashInfo | null {
  return current;
}

export function subscribeCrash(listener: (crash: CrashInfo | null) => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

type GlobalErrorUtils = {
  getGlobalHandler?: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

/**
 * Routes fatal JS errors to the crash screen instead of letting React Native close the
 * app. Non-fatal errors still go to the previous handler (dev red box / logs).
 */
export function installGlobalErrorHandler(errorUtils: GlobalErrorUtils | undefined = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils): boolean {
  if (!errorUtils?.setGlobalHandler) return false;
  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      reportCrash(error, "global");
      return; // keep the process alive so the crash screen can render
    }
    try { previous?.(error, isFatal); } catch { /* ignore */ }
  });
  return true;
}
