// Entry point. The crash handler loads first, before polyfills, ethers or WalletConnect,
// so any startup error shows an on-screen message instead of closing the app.
import { installGlobalErrorHandler } from "./src/crash/crashStore";
import { registerRootComponent } from "expo";
import { createRoot } from "./src/crash/Root";

installGlobalErrorHandler();

// App (and its polyfill imports) is required lazily inside Root so module-load errors are caught.
registerRootComponent(createRoot(() => require("./App")));
