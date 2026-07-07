// nativeBridge.js
//
// Owns the single native-messaging connection to JabRef's host
// (browser-bridge/jabext_host.py | jabext_host.ps1, host name
// "jabext_bridge"). The host binds one loopback HTTP port and writes one
// discovery file per OS process; if two extension modules each called
// `connectNative` independently, the browser would spawn two host processes that race
// to write the same discovery file. So every feature (fulltext fetch,
// MathSciNet tab sync, ...) registers a handler here instead of opening
// its own native-messaging port.
//
// Dispatch is by the incoming message's `type` field. Handlers get the
// raw message and must reply themselves via `reply()`.

const HOST_NAME = "jabext_bridge";

let port = null;
const handlers = new Map();

function onMessage(msg) {
  if (!msg || !msg.type) {
    return;
  }
  const handler = handlers.get(msg.type);
  if (!handler) {
    console.debug("[native-bridge] no handler registered for type", msg.type);
    return;
  }
  handler(msg);
}

function connect() {
  try {
    port = browser.runtime.connectNative(HOST_NAME);
  } catch (e) {
    console.warn("[native-bridge] connectNative failed:", e);
    port = null;
    return;
  }
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => {
    const err = browser.runtime.lastError;
    console.debug("[native-bridge] native port disconnected", err && err.message);
    port = null;
  });
  console.debug("[native-bridge] connected to native host", HOST_NAME);
}

/// Registers the handler invoked for native messages whose `type` matches.
/// Only one handler per type; a later registration replaces an earlier one.
export function registerHandler(type, handler) {
  handlers.set(type, handler);
}

/// Sends a reply/message back to the host process over the native port.
export function reply(msg) {
  if (!port) {
    console.warn("[native-bridge] reply dropped (no port):", msg);
    return;
  }
  try {
    port.postMessage(msg);
  } catch (e) {
    console.warn("[native-bridge] postMessage failed:", e);
  }
}

/// Idempotent: reconnecting on every service-worker restart is safe since
/// the host process no-ops when its port is already alive.
export function startNativeBridge() {
  if (port) return;
  connect();
}
