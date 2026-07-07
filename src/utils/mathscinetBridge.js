// mathscinetBridge.js
//
// Extension side of the MathSciNet browser-sync command
// (`req~mathscinet.sync.*~1`, spec in JabRef's
// `docs/requirements/mathscinet.md`). Lets JabRef keep one browser tab
// showing the MathSciNet page for whichever entry is currently selected,
// instead of the embedded WebView tab JabRef dropped.
//
// Flow per request:
//   1. Bridge sends `{ type: "openMathSciNet", requestId, mrNumber }`.
//   2. If we still own a tab we previously opened for this feature,
//      navigate that same tab to the new id and focus it.
//   3. Otherwise open a new tab and remember its id.
//   4. Reply `{ requestId, action: "opened" | "focused", tabId }` or
//      `{ requestId, error, message }`.
//
// Tab ownership rule: this module only ever acts on `trackedTabId`, the
// id of a tab *it* created. It never enumerates or matches tabs by URL,
// so a MathSciNet tab the user opened by hand (e.g. via the identifier
// editor's "open in external browser" button) is never touched.

import { registerHandler, reply } from "./nativeBridge.js";

let trackedTabId = null;
let lastSync = null; // { mrNumber, action, tabId, timestamp } of the most recent successful sync

function mathSciNetUrl(mrNumber) {
  return `https://www.ams.org/mathscinet-getitem?mr=${encodeURIComponent(mrNumber)}`;
}

function recordSync(mrNumber, action, tabId) {
  lastSync = { mrNumber, action, tabId, timestamp: Date.now() };
}

async function getTrackedTab() {
  if (trackedTabId == null) {
    return null;
  }
  try {
    return await browser.tabs.get(trackedTabId);
  } catch {
    // Tab was closed (by the user or otherwise) since we last used it.
    trackedTabId = null;
    return null;
  }
}

async function onMessage(msg) {
  const { requestId, mrNumber } = msg;
  if (!requestId) {
    return;
  }
  if (!mrNumber || !String(mrNumber).trim()) {
    reply({ requestId, error: "bad-request", message: "mrNumber is required" });
    return;
  }

  const target = mathSciNetUrl(mrNumber);
  try {
    const existing = await getTrackedTab();
    if (existing) {
      await browser.tabs.update(existing.id, { url: target, active: true });
      await browser.windows.update(existing.windowId, { focused: true });
      recordSync(mrNumber, "focused", existing.id);
      reply({ requestId, action: "focused", tabId: existing.id });
      return;
    }

    const tab = await browser.tabs.create({ url: target, active: true });
    trackedTabId = tab.id;
    recordSync(mrNumber, "opened", tab.id);
    reply({ requestId, action: "opened", tabId: tab.id });
  } catch (e) {
    reply({
      requestId,
      error: "internal-error",
      message: String(e && e.message ? e.message : e),
    });
  }
}

browser.tabs.onRemoved.addListener((tabId) => {
  if (tabId === trackedTabId) {
    trackedTabId = null;
  }
});

export function startMathSciNetBridge() {
  registerHandler("openMathSciNet", onMessage);
}

/// Info about the most recent successful sync, or `null` if none happened yet this session.
export function getLastSync() {
  return lastSync;
}
