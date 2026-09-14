import { describe, it, expect, beforeEach } from "vitest";

import { waitForComplete } from "./fulltextBridge.js";

// Minimal tabs.onUpdated / scripting stub: `metaRefresh` is what the page currently loaded in the tab
// reports for <meta http-equiv="refresh">.
let listeners;
let metaRefresh;
function fire(tabId, url) {
  for (const l of [...listeners]) l(tabId, { status: "complete" }, { url });
}

beforeEach(() => {
  listeners = new Set();
  metaRefresh = false;
  globalThis.browser = {
    tabs: {
      onUpdated: {
        addListener: (l) => listeners.add(l),
        removeListener: (l) => listeners.delete(l),
      },
    },
    scripting: { executeScript: async () => [{ result: metaRefresh }] },
  };
});

describe("waitForComplete", () => {
  it("resolves with the first completed page when it does not forward", async () => {
    const p = waitForComplete(7);
    fire(7, "https://www.mdpi.com/1");
    expect(await p).toBe("https://www.mdpi.com/1");
    expect(listeners.size).toBe(0);
  });

  it("waits through a meta-refresh interstitial such as Elsevier's linkinghub", async () => {
    metaRefresh = true;
    const p = waitForComplete(7);
    fire(7, "https://linkinghub.elsevier.com/retrieve/pii/S0950584914000883");
    await new Promise((r) => setTimeout(r, 0));
    metaRefresh = false;
    fire(7, "https://www.sciencedirect.com/science/article/pii/S0950584914000883");
    expect(await p).toBe("https://www.sciencedirect.com/science/article/pii/S0950584914000883");
  });

  it("ignores other tabs", async () => {
    const p = waitForComplete(7);
    fire(8, "https://other/");
    fire(7, "https://mine/");
    expect(await p).toBe("https://mine/");
  });
});
