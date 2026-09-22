// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";

import { runPdfScan } from "./fulltextBridge.js";

// Runs the injected scanner against this jsdom document.
beforeEach(() => {
  globalThis.browser = {
    scripting: { executeScript: async ({ func }) => [{ result: func() }] },
  };
});

// jsdom serves the document from its default origin (location.origin).
function page(html) {
  document.body.innerHTML = html;
}

describe("runPdfScan", () => {
  it("turns ACM's PDF/eReader link into the PDF URL", async () => {
    page('<a href="/doi/epdf/10.1145/3643788.3648014">PDF/eReader</a>');
    expect(await runPdfScan(1)).toEqual({
      pdfUrl: `${location.origin}/doi/pdf/10.1145/3643788.3648014`,
    });
  });

  it("keeps an Atypon /doi/pdf/ link", async () => {
    page('<a href="/doi/pdf/10.1002/xyz?download=true">PDF</a>');
    expect(await runPdfScan(1)).toEqual({ pdfUrl: `${location.origin}/doi/pdf/10.1002/xyz?download=true` });
  });

  it("prefers a direct .pdf link", async () => {
    page('<a href="/doi/epdf/10.1/x">Reader</a><a href="/files/x.pdf">PDF</a>');
    expect(await runPdfScan(1)).toEqual({ pdfUrl: `${location.origin}/files/x.pdf` });
  });

  it("reports no-adapter without any PDF link", async () => {
    page('<a href="/about">About</a>');
    expect((await runPdfScan(1)).errorCode).toBe("no-adapter");
  });
});
