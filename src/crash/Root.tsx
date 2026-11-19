import React, { useEffect, useState, type ComponentType } from "react";
import { CrashScreen } from "./CrashScreen";
import { clearCrash, getCrash, reportCrash, subscribeCrash, type CrashInfo } from "./crashStore";

type AppModule = { default: ComponentType };

/** Loads App lazily so an error while evaluating its imports shows the crash screen. */
function loadApp(load: () => AppModule): ComponentType | null {
  try {
    return load().default;
  } catch (error) {
    reportCrash(error, "startup");
    return null;
  }
}

class RenderBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { reportCrash(error, "render"); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function createRoot(load: () => AppModule) {
  let App: ComponentType | null = null;
  return function Root() {
    const [crash, setCrash] = useState<CrashInfo | null>(getCrash());
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      const off = subscribeCrash(setCrash);
      setCrash(getCrash()); // catch errors reported before this effect subscribed (first-render failures)
      return off;
    }, []);
    if (!crash && !App) App = loadApp(load);
    const current = crash ?? getCrash();
    if (current || !App) {
      return <CrashScreen crash={current ?? { message: "TREX could not start.", stack: "", source: "startup", at: new Date().toISOString() }} onRetry={() => { clearCrash(); setAttempt((n) => n + 1); }} />;
    }
    return <RenderBoundary key={attempt}><App /></RenderBoundary>;
  };
}
