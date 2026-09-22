// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { fetchPdfInTab } from "./fulltextBridge.js";

// Runs the injected function in this jsdom page; `served` is what the page's fetch answers.
let served;
const pageFetch = globalThis.fetch;
const createObjectURL = URL.createObjectURL;
beforeEach(() => {
  globalThis.fetch = async (url) =>
    url.startsWith("data:") ? pageFetch(url) : { ok: served.ok, blob: async () => new Blob([served.body]) };
  globalThis.browser = {
    scripting: { executeScript: async ({ func, args }) => [{ result: await func(...args) }] },
  };
});
afterEach(() => {
  globalThis.fetch = pageFetch;
  URL.createObjectURL = createObjectURL;
});

describe("fetchPdfInTab", () => {
  it("returns the PDF the page fetched as a blob URL (Firefox)", async () => {
    let saved;
    URL.createObjectURL = (blob) => {
      saved = blob;
      return "blob:saved";
    };
    served = { ok: true, body: "%PDF-1.7 body" };
    const url = await fetchPdfInTab(1, "https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=1&ref=");
    expect(url).toBe("blob:saved");
    expect(await saved.text()).toBe("%PDF-1.7 body");
  });

  it("returns the PDF the page fetched as a data URL without URL.createObjectURL (Chrome)", async () => {
    URL.createObjectURL = undefined;
    served = { ok: true, body: "%PDF-1.7 body" };
    const url = await fetchPdfInTab(1, "https://ieeexplore.ieee.org/stampPDF/getPDF.jsp?tp=&arnumber=1&ref=");
    expect(atob(url.split(",")[1])).toBe("%PDF-1.7 body");
  });

  it("returns null for a login page instead of the PDF", async () => {
    served = { ok: true, body: "<!DOCTYPE html>" };
    expect(await fetchPdfInTab(1, "https://ieeexplore.ieee.org/x")).toBeNull();
  });

  it("returns null for an empty body", async () => {
    served = { ok: true, body: "" };
    expect(await fetchPdfInTab(1, "https://ieeexplore.ieee.org/x")).toBeNull();
  });

  it("returns null when the script cannot run in the tab", async () => {
    globalThis.browser.scripting.executeScript = async () => {
      throw new Error("Missing host permission for the tab");
    };
    expect(await fetchPdfInTab(1, "https://ieeexplore.ieee.org/x")).toBeNull();
  });
});
