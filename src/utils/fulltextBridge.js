// fulltextBridge.js
//
// Implements the extension side of the JabRef Browser-Extension Fulltext
// Protocol (req~bxf~). JabRef's native-messaging host (browser-bridge/
// jabext_host.py | jabext_host.ps1) exposes a loopback HTTP server for JabRef
// and forwards each request to this module over the single native-messaging
// connection owned by nativeBridge.js.
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

import { registerHandler, reply } from "./nativeBridge.js";

const TAB_TIMEOUT_MS = 60_000;
const DOWNLOAD_SUBDIR = "jabref-fulltext";

function onMessage(msg) {
  if (!msg || !msg.requestId) {
    return;
  }
  handleFetch(msg).catch((err) => {
    reply({
      requestId: msg.requestId,
      error: "internal-error",
      message: String(err && err.message ? err.message : err),
    });
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
  registerHandler("fetchFulltext", onMessage);
}
