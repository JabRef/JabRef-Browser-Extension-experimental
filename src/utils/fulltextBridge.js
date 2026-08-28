// fulltextBridge.js
//
// Implements the extension side of the JabRef Browser-Extension Fulltext
// Protocol (req~bxf~). JabRef's native-messaging host (browser-bridge/
// jabext_host.py | jabext_host.ps1) exposes a loopback HTTP server for JabRef
// and forwards each request to this module over native messaging. The same
// single connection also carries the import direction — see sendImportToHost,
// which replaces the old separate `org.jabref.jabref` host.
//
// Flow per request:
//   1. Bridge sends `{ type: "fetchFulltext", requestId, doi, url }`.
//   2. We resolve the target page URL, open it in a background tab.
//   3. Run a generic <a href="*.pdf"> scanner via scripting.executeScript.
//   4. Download the PDF via downloads.download into a per-request file.
//   5. Reply `{ requestId, id, path, sourceUrl }` or
//      `{ requestId, error, message }`.
//
// Failures are reported as protocol error codes (no-pdf-found, not-reachable,
// no-adapter, timeout, internal-error) so the bridge can map them to HTTP.

const HOST_NAME = "jabext_bridge";
const TAB_TIMEOUT_MS = 60_000;
const DOWNLOAD_SUBDIR = "jabref-fulltext";

let port = null;
// FIFO of pending import replies. Import commands carry no requestId (the host
// routes anything without one to its import handler), so replies — which arrive
// in send order for the realistic one-at-a-time case — correlate by queue.
const importWaiters = [];

function rejectImportWaiters(reason) {
  while (importWaiters.length) {
    const waiter = importWaiters.shift();
    clearTimeout(waiter.timer);
    waiter.reject(new Error(reason));
  }
}

function connect() {
  try {
    port = browser.runtime.connectNative(HOST_NAME);
  } catch (e) {
    console.warn("[fulltext-bridge] connectNative failed:", e);
    port = null;
    return;
  }
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(() => {
    const err = browser.runtime.lastError;
    console.debug("[fulltext-bridge] native port disconnected", err && err.message);
    port = null;
    rejectImportWaiters("native host disconnected");
  });
  console.debug("[fulltext-bridge] connected to native host", HOST_NAME);
}

function reply(msg) {
  if (!port) {
    console.warn("[fulltext-bridge] reply dropped (no port):", msg);
    return;
  }
  try {
    port.postMessage(msg);
  } catch (e) {
    console.warn("[fulltext-bridge] postMessage failed:", e);
  }
}

function onMessage(msg) {
  if (!msg) return;
  if (msg.type === "fetchFulltext" && msg.requestId) {
    handleFetch(msg).catch((err) => {
      reply({
        requestId: msg.requestId,
        error: "internal-error",
        message: String(err && err.message ? err.message : err),
      });
    });
    return;
  }
  // Import reply from the folded-in host: jarFound / jarNotFound / ok / error.
  if (typeof msg.message === "string") {
    const waiter = importWaiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
    }
  }
}

// Send an import/validate command to the same native host over the shared
// connection and resolve with its reply. Replaces sendNativeMessage to the old
// `org.jabref.jabref` host; only the background service worker should call this,
// so a single host instance owns the discovery file and loopback port.
export function sendImportToHost(message, timeoutMs = 30_000) {
  return new Promise((resolve, reject) => {
    if (!port) connect();
    if (!port) {
      reject(new Error("native host unavailable"));
      return;
    }
    const waiter = { resolve, reject, timer: null };
    waiter.timer = setTimeout(() => {
      const i = importWaiters.indexOf(waiter);
      if (i >= 0) importWaiters.splice(i, 1);
      reject(new Error("native host import timeout"));
    }, timeoutMs);
    importWaiters.push(waiter);
    try {
      port.postMessage(message);
    } catch (e) {
      clearTimeout(waiter.timer);
      const i = importWaiters.indexOf(waiter);
      if (i >= 0) importWaiters.splice(i, 1);
      reject(e);
    }
  });
}

async function handleFetch({ requestId, doi, url }) {
  const target = (url && url.trim()) || (doi ? `https://doi.org/${encodeURIComponent(doi)}` : null);
  if (!target) {
    reply({ requestId, error: "bad-request", message: "no doi or url" });
    return;
  }

  let tabId = null;
  try {
    const tab = await browser.tabs.create({ url: target, active: false });
    tabId = tab.id;
    const finalUrl = await waitForComplete(tabId);

    const scanResult = await runPdfScan(tabId);
    if (!scanResult.pdfUrl) {
      reply({
        requestId,
        error: scanResult.errorCode || "no-pdf-found",
        message: scanResult.message || "no PDF link discovered on page",
      });
      return;
    }

    const download = await downloadPdf(scanResult.pdfUrl, requestId);
    reply({
      requestId,
      id: requestId,
      path: download.path,
      sourceUrl: scanResult.pdfUrl || finalUrl,
    });
  } catch (e) {
    const code = e && e.code ? e.code : "internal-error";
    reply({ requestId, error: code, message: String(e && e.message ? e.message : e) });
  } finally {
    if (tabId != null) {
      browser.tabs.remove(tabId).catch(() => {});
    }
  }
}

function waitForComplete(tabId) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      const err = new Error("tab load timeout");
      err.code = "timeout";
      reject(err);
    }, TAB_TIMEOUT_MS);

    const listener = (id, info, tab) => {
      if (id !== tabId) return;
      if (info.status === "complete") {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve(tab.url);
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

async function runPdfScan(tabId) {
  // Generic scanner: inspect <meta name="citation_pdf_url">, <link rel=alternate>,
  // and any visible <a href="*.pdf"> on the page. Publisher-specific helpers
  // (Elsevier, IEEE, ACM, ...) live in AnchorHub; experimental ships only this
  // generic fallback.
  const results = await browser.scripting.executeScript({
    target: { tabId },
    func: () => {
      const meta = document.querySelector('meta[name="citation_pdf_url"]');
      if (meta && meta.content) {
        return { pdfUrl: meta.content };
      }
      const linkAlt = document.querySelector('link[rel="alternate"][type="application/pdf"]');
      if (linkAlt && linkAlt.href) {
        return { pdfUrl: linkAlt.href };
      }
      const anchor = Array.from(document.querySelectorAll("a[href]")).find((a) =>
        /\.pdf(\?|$)/i.test(a.href),
      );
      if (anchor) {
        return { pdfUrl: anchor.href };
      }
      return { pdfUrl: null, errorCode: "no-adapter", message: "no generic PDF link found" };
    },
  });
  return (results && results[0] && results[0].result) || { pdfUrl: null };
}

async function downloadPdf(pdfUrl, requestId) {
  return new Promise((resolve, reject) => {
    let downloadId = null;
    const listener = (delta) => {
      if (delta.id !== downloadId) return;
      if (delta.state && delta.state.current === "complete") {
        browser.downloads.onChanged.removeListener(listener);
        browser.downloads.search({ id: downloadId }).then((items) => {
          if (!items || !items.length) {
            const err = new Error("download not found");
            err.code = "internal-error";
            reject(err);
            return;
          }
          resolve({ path: items[0].filename });
        });
      } else if (delta.state && delta.state.current === "interrupted") {
        browser.downloads.onChanged.removeListener(listener);
        const err = new Error("download interrupted");
        err.code = "not-reachable";
        reject(err);
      }
    };
    browser.downloads.onChanged.addListener(listener);

    browser.downloads
      .download({
        url: pdfUrl,
        filename: `${DOWNLOAD_SUBDIR}/${requestId}.pdf`,
        conflictAction: "uniquify",
        saveAs: false,
      })
      .then((id) => {
        downloadId = id;
      })
      .catch((e) => {
        browser.downloads.onChanged.removeListener(listener);
        const err = new Error(String(e && e.message ? e.message : e));
        err.code = "not-reachable";
        reject(err);
      });
  });
}

export function startFulltextBridge() {
  if (port) return;
  connect();
}
