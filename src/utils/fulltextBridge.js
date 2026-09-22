// fulltextBridge.js
//
// Implements the extension side of the JabRef Browser-Extension Fulltext
// Protocol (req~bxf~). JabRef's native-messaging host (browser-bridge/
// jabext_host.py | jabext_host.ps1) exposes a loopback HTTP server for JabRef
// and forwards each request to this module over native messaging.
//
// Flow per request:
//   1. Bridge sends `{ type: "fetchFulltext", requestId, doi, url }`.
//   2. We resolve the target page URL, open it in a background tab.
//   3. Locate the PDF: first via the bundled Zotero translators (run in the tab),
//      then a generic <meta/link/anchor> scanner as fallback.
//   4. Fetch the PDF inside the tab (the page's cookies and Referer) and save it via
//      downloads.download into a per-request file; download the URL directly if that fails.
//   5. Reply `{ requestId, id, path, sourceUrl }` or
//      `{ requestId, error, message }`.
//
// Failures are reported as protocol error codes (no-pdf-found, not-reachable,
// no-adapter, timeout, internal-error) so the bridge can map them to HTTP.

import { FetchConcurrencyGate } from "./fetchConcurrency.js";
import { registerHandler, reply } from "./nativeBridge.js";

// Matches the bridge's own fetch timeout (FetchTimeoutMs in jabext_host.ps1/.py): an SSO chain
// or a slow publisher may take minutes.
const TAB_TIMEOUT_MS = 300_000;
// How often a tab that has not reported "complete" is checked for a parsed document.
const STALL_POLL_MS = 10_000;
const DOWNLOAD_SUBDIR = "jabref-fulltext";

// req~bxf.concurrency-cap~1: cap concurrent fetch tabs (global 3, per publisher host 2) and
// FIFO-queue the rest, so a publisher such as IEEE is not hit hard enough to return HTTP 420.
const gate = new FetchConcurrencyGate(3, 2);

function hostOf(target) {
  try {
    return new URL(target).host;
  } catch {
    return target;
  }
}

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

  // Wait for a slot before opening a tab, so we never hit a publisher harder than the caps allow.
  const host = hostOf(target);
  await gate.acquire(host);
  let tabId = null;
  try {
    const tab = await browser.tabs.create({ url: target, active: false });
    tabId = tab.id;
    const finalUrl = await waitForComplete(tabId);

    // Prefer the bundled Zotero translators: they know publisher-specific PDF
    // locations the generic scanner misses (e.g. ACM's /doi/pdf/<doi>). They run
    // in this live tab, so they use the user's session. Fall back to the generic
    // scanner when no translator matches or it yields no PDF.
    let pdfUrl = await findPdfViaTranslators(tabId, finalUrl);
    if (!pdfUrl) {
      const scanResult = await runPdfScan(tabId);
      if (!scanResult.pdfUrl) {
        reply({
          requestId,
          error: scanResult.errorCode || "no-pdf-found",
          message: scanResult.message || "no PDF link discovered on page",
        });
        return;
      }
      pdfUrl = scanResult.pdfUrl;
    }

    const fetched = await fetchPdfInTab(tabId, pdfUrl);
    let download;
    try {
      download = await downloadPdf(fetched || pdfUrl, requestId);
    } finally {
      if (fetched && fetched.startsWith("blob:")) {
        URL.revokeObjectURL(fetched);
      }
    }
    reply({
      requestId,
      id: requestId,
      path: download.path,
      sourceUrl: pdfUrl || finalUrl,
    });
  } catch (e) {
    const code = e && e.code ? e.code : "internal-error";
    reply({ requestId, error: code, message: String(e && e.message ? e.message : e) });
  } finally {
    if (tabId != null) {
      browser.tabs.remove(tabId).catch(() => {});
    }
    gate.release(host);
  }
}

// Resolves with the tab's URL once it shows a page that does not forward again.
// Some publishers resolve a DOI to an interstitial that forwards via
// <meta http-equiv="refresh"> after a delay (Elsevier's linkinghub, 2 s). Its
// load already reports "complete", so keep waiting through such pages. One
// listener records every load for the whole wait, so a forward that completes
// while the previous page is still being inspected is not missed.
//
// Firefox throttles background tabs, and some pages (IEEE Xplore) then do not fire
// their load event until the tab is activated. So a tab that stays silent is polled:
// a parsed document counts as a load, since PDF discovery only needs the DOM. The
// poll also covers a load that completed before the listener was attached. All scripts
// in this file are injected immediately: Firefox's default (document_idle) waits for
// the very load event that does not come.
export async function waitForComplete(tabId) {
  const deadline = Date.now() + TAB_TIMEOUT_MS;
  const loads = [];
  let inspected = 0;
  let notify = () => {};
  const record = (url) => {
    loads.push(url);
    notify();
  };
  const listener = (id, info, tab) => {
    if (id === tabId && info.status === "complete") {
      record(tab.url);
    }
  };
  browser.tabs.onUpdated.addListener(listener);
  const poller = setInterval(async () => {
    const url = await parsedUrl(tabId);
    if (url && loads.length <= inspected) {
      record(url);
    }
  }, STALL_POLL_MS);
  try {
    for (;;) {
      if (loads.length <= inspected) {
        await nextLoad(deadline, (resolve) => (notify = resolve));
      }
      const url = loads[inspected++];
      const forwards = await hasMetaRefresh(tabId);
      // A newer load arrived meanwhile: the inspected document may already be the next page.
      if (!forwards && loads.length <= inspected) {
        return url;
      }
    }
  } finally {
    clearInterval(poller);
    browser.tabs.onUpdated.removeListener(listener);
  }
}

// The tab's URL once its document is parsed (readyState "interactive" or later), else null.
async function parsedUrl(tabId) {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      injectImmediately: true,
      func: () => (document.readyState === "loading" ? null : location.href),
    });
    const url = results && results[0] && results[0].result;
    return url && url !== "about:blank" ? url : null;
  } catch {
    return null;
  }
}

function nextLoad(deadline, onWait) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => {
        const err = new Error("tab load timeout");
        err.code = "timeout";
        reject(err);
      },
      Math.max(0, deadline - Date.now()),
    );
    onWait(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// True when the page forwards elsewhere within a few seconds. Long refresh
// intervals (session keep-alive) are not a forward. The target may follow the
// delay directly or after "url=".
async function hasMetaRefresh(tabId) {
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      injectImmediately: true,
      func: () => {
        const meta = document.querySelector('meta[http-equiv="refresh" i]');
        const match = meta && /^\s*(\d+)\s*[;,]\s*(?:url\s*=)?\s*\S/i.exec(meta.content || "");
        return Boolean(match) && Number(match[1]) <= 10;
      },
    });
    return Boolean(results && results[0] && results[0].result);
  } catch {
    return false;
  }
}

// Ask the bundled Zotero translators (run in the loaded tab) for a PDF attachment
// URL. Returns the URL, or null when no translator matches, none yields a PDF, or
// the content script cannot be reached (caller then falls back to runPdfScan).
async function findPdfViaTranslators(tabId, url) {
  try {
    // The content script is registered at runtime (not auto-injected); inject it
    // into this tab before messaging it (same as the import flow's content path).
    await browser.scripting.executeScript({
      target: { tabId },
      injectImmediately: true,
      files: ["/content-scripts/content.js"],
    });
    const detect = await browser.tabs.sendMessage(tabId, { type: "detectTranslators", url });
    const translatorsInfo = (detect && detect.translatorsInfo) || [];
    if (!translatorsInfo.length) {
      return null;
    }
    const result = await browser.tabs.sendMessage(tabId, {
      type: "fulltextPdfUrl",
      url,
      translatorsInfo,
    });
    return (result && result.pdfUrl) || null;
  } catch (e) {
    console.debug("[fulltext-bridge] translator extraction failed, using generic scan:", e);
    return null;
  }
}

export async function runPdfScan(tabId) {
  // Generic fallback scanner, used when no translator finds a PDF: inspect
  // <meta name="citation_pdf_url">, <link rel=alternate>, any visible
  // <a href="*.pdf"> on the page, and Atypon-style /doi/pdf/ and /doi/epdf/ links.
  const results = await browser.scripting.executeScript({
    target: { tabId },
    injectImmediately: true,
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
      // Atypon platforms (ACM, Wiley, Taylor & Francis, SAGE) link the PDF as /doi/pdf/<doi> or
      // only as the /doi/epdf/<doi> HTML reader, e.g. ACM's "PDF/eReader" button. The reader
      // is not the PDF itself; /doi/pdf/ on the same host is.
      const atypon = Array.from(document.querySelectorAll("a[href]")).find((a) =>
        /\/doi\/e?pdf\//.test(new URL(a.href).pathname),
      );
      if (atypon) {
        const url = new URL(atypon.href);
        url.pathname = url.pathname.replace("/doi/epdf/", "/doi/pdf/");
        return { pdfUrl: url.href };
      }
      return { pdfUrl: null, errorCode: "no-adapter", message: "no generic PDF link found" };
    },
  });
  return (results && results[0] && results[0].result) || { pdfUrl: null };
}

// Fetches the PDF from inside the publisher's tab, as a click there would: with the page's
// cookies and the page as Referer. IEEE's getPDF.jsp serves an empty body to a plain
// downloads.download() but the PDF to this request. Returns a URL of the fetched bytes for
// downloadPdf, or null when the page could not fetch a PDF (cross-origin, not a PDF, ...).
export async function fetchPdfInTab(tabId, pdfUrl) {
  let dataUrl = null;
  try {
    const results = await browser.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      injectImmediately: true,
      args: [pdfUrl],
      func: async (url) => {
        try {
          const response = await fetch(url, { credentials: "include" });
          const blob = await response.blob();
          if (!response.ok || (await blob.slice(0, 5).text()) !== "%PDF-") {
            return null;
          }
          return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          });
        } catch {
          return null;
        }
      },
    });
    dataUrl = results && results[0] && results[0].result;
  } catch (e) {
    console.debug("[fulltext-bridge] in-tab PDF fetch failed, downloading directly:", e);
  }
  if (!dataUrl) {
    return null;
  }
  // Chrome's service worker has no URL.createObjectURL; its downloads API takes data: URLs.
  if (typeof URL.createObjectURL !== "function") {
    return dataUrl;
  }
  return URL.createObjectURL(await (await fetch(dataUrl)).blob());
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
