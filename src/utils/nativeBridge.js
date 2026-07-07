// nativeBridge.js
//
// Owns the single native-messaging connection to JabRef's host
// (browser-bridge/jabext_host.py | jabext_host.ps1, host name
// "jabext_bridge"). The host binds one loopback HTTP port and writes one
// discovery file per OS process; if two extension modules each called
// `connectNative` independently, the browser would spawn two host processes
// that race to write the same discovery file. So every feature (fulltext
// fetch, MathSciNet tab sync, ...) registers a handler here instead of
// opening its own native-messaging port, and the import direction
// (sendImportToHost) rides on the same connection.
//
// Dispatch is by the incoming message's `type` field. Handlers get the
// raw message and must reply themselves via `reply()`. Messages without a
// `type` are replies to import commands and resolve the oldest waiter.

const HOST_NAME = "jabext_bridge";

let port = null;
const handlers = new Map();
// FIFO of pending import replies. Import commands carry no requestId (the host
// routes anything without one to its import handler), so replies — which arrive
// in send order for the realistic one-at-a-time case — correlate by queue.
const importWaiters = [];

function dropWaiter(waiter) {
  clearTimeout(waiter.timer);
  const i = importWaiters.indexOf(waiter);
  if (i >= 0) importWaiters.splice(i, 1);
}

function rejectImportWaiters(reason) {
  while (importWaiters.length) {
    const waiter = importWaiters.shift();
    clearTimeout(waiter.timer);
    waiter.reject(new Error(reason));
  }
}

function onMessage(msg) {
  if (!msg) {
    return;
  }
  if (!msg.type) {
    // Import reply from the folded-in host: jarFound / jarNotFound / ok / error.
    if (typeof msg.message === "string") {
      const waiter = importWaiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      }
    }
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
    rejectImportWaiters("native host disconnected");
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

/// Sends an import/validate command to the host over the shared connection and
/// resolves with its reply. Replaces sendNativeMessage to the old
/// `org.jabref.jabref` host; only the background service worker should call
/// this, so a single host instance owns the discovery file and loopback port.
export function sendImportToHost(message, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    if (!port) connect();
    if (!port) {
      reject(new Error("native host unavailable"));
      return;
    }
    const waiter = { resolve, reject, timer: null };
    waiter.timer = setTimeout(() => {
      dropWaiter(waiter);
      reject(new Error("native host import timeout"));
    }, timeoutMs);
    importWaiters.push(waiter);
    try {
      port.postMessage(message);
    } catch (e) {
      dropWaiter(waiter);
      reject(e);
    }
  });
}

/// Idempotent: reconnecting on every service-worker restart is safe since
/// the host process no-ops when its port is already alive.
export function startNativeBridge() {
  if (port) return;
  connect();
}
