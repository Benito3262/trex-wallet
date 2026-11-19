import { PROVIDER_ICON } from "./providerIcon";

/**
 * EIP-1193 provider injected into every main-frame page before its scripts
 * run. The page can only *ask*; every request goes to the native side via
 * postMessage, and anything that signs, sends, connects or switches networks
 * opens a TREX review sheet. Nothing here can access keys.
 */

export const PROVIDER_INFO = {
  name: "TREX Wallet",
  rdns: "com.trexwallet.app",
  icon: PROVIDER_ICON
};

export function buildProviderScript(uuid: string): string {
  const info = JSON.stringify({ ...PROVIDER_INFO, uuid });
  return `(function () {
  if (window.__trexWallet) { return; }
  var bridge = window.ReactNativeWebView;
  if (!bridge || typeof bridge.postMessage !== "function") { return; }
  var nextId = 1;
  var pending = {};
  var listeners = {};
  var info = ${info};

  function emit(event, data) {
    var list = (listeners[event] || []).slice();
    for (var i = 0; i < list.length; i++) {
      try { list[i](data); } catch (e) { setTimeout(function () { throw e; }, 0); }
    }
  }

  function rpcError(err) {
    var error = new Error((err && err.message) || "TREX Wallet request failed");
    error.code = (err && typeof err.code === "number") ? err.code : -32603;
    if (err && err.data !== undefined) { error.data = err.data; }
    return error;
  }

  function send(method, params) {
    return new Promise(function (resolve, reject) {
      var id = "trex-" + (nextId++);
      pending[id] = { resolve: resolve, reject: reject };
      try {
        bridge.postMessage(JSON.stringify({ __trex: 1, id: id, method: method, params: params === undefined ? [] : params }));
      } catch (e) {
        delete pending[id];
        reject(rpcError({ code: -32603, message: "Could not reach TREX Wallet" }));
      }
    });
  }

  var provider = {
    isTrex: true,
    isTrexWallet: true,
    isMetaMask: false,
    chainId: null,
    networkVersion: null,
    selectedAddress: null,
    _connected: true,
    isConnected: function () { return provider._connected; },
    request: function (args) {
      if (!args || typeof args !== "object" || typeof args.method !== "string") {
        return Promise.reject(rpcError({ code: -32602, message: "request() expects { method, params }" }));
      }
      return send(args.method, args.params);
    },
    enable: function () { return provider.request({ method: "eth_requestAccounts" }); },
    send: function (methodOrPayload, paramsOrCallback) {
      if (typeof methodOrPayload === "string") { return provider.request({ method: methodOrPayload, params: paramsOrCallback }); }
      if (typeof paramsOrCallback === "function") { return provider.sendAsync(methodOrPayload, paramsOrCallback); }
      return provider.request(methodOrPayload);
    },
    sendAsync: function (payload, callback) {
      provider.request(payload).then(function (result) {
        callback(null, { id: payload.id, jsonrpc: "2.0", result: result });
      }, function (error) { callback(error, null); });
    },
    on: function (event, handler) { (listeners[event] = listeners[event] || []).push(handler); return provider; },
    addListener: function (event, handler) { return provider.on(event, handler); },
    once: function (event, handler) {
      function wrapped(data) { provider.removeListener(event, wrapped); handler(data); }
      return provider.on(event, wrapped);
    },
    removeListener: function (event, handler) {
      listeners[event] = (listeners[event] || []).filter(function (h) { return h !== handler; });
      return provider;
    },
    off: function (event, handler) { return provider.removeListener(event, handler); },
    removeAllListeners: function (event) { if (event) { delete listeners[event]; } else { listeners = {}; } return provider; }
  };

  window.__trexWallet = {
    receive: function (message) {
      if (!message || typeof message !== "object") { return; }
      if (message.event) {
        if (message.event === "chainChanged") { provider.chainId = message.data; provider.networkVersion = String(parseInt(message.data, 16)); }
        if (message.event === "accountsChanged") { provider.selectedAddress = (message.data && message.data[0]) || null; }
        if (message.event === "connect") { provider._connected = true; }
        if (message.event === "disconnect") { provider._connected = false; }
        emit(message.event, message.data);
        return;
      }
      var entry = pending[message.id];
      if (!entry) { return; }
      delete pending[message.id];
      if (message.error) { entry.reject(rpcError(message.error)); }
      else {
        if (message.method === "eth_chainId") { provider.chainId = message.result; provider.networkVersion = String(parseInt(message.result, 16)); }
        if ((message.method === "eth_requestAccounts" || message.method === "eth_accounts") && Array.isArray(message.result)) { provider.selectedAddress = message.result[0] || null; }
        entry.resolve(message.result);
      }
    }
  };

  try {
    Object.defineProperty(window, "ethereum", { value: provider, configurable: false, writable: false });
  } catch (e) {
    window.ethereum = provider;
  }

  function announce() {
    var detail = Object.freeze({ info: Object.freeze(info), provider: provider });
    window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: detail }));
  }
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
  window.dispatchEvent(new Event("ethereum#initialized"));
  send("eth_chainId", []).then(function () { emit("connect", { chainId: provider.chainId }); }, function () {});
})(); true;`;
}

/** Serializes a message for injectJavaScript, escaping characters that break JS string literals. */
export function buildReceiveScript(message: unknown): string {
  const json = JSON.stringify(message)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
    .replace(/<\/script/gi, "<\\/script");
  return `window.__trexWallet && window.__trexWallet.receive(${json}); true;`;
}
