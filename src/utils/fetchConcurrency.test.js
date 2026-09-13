import { describe, it, expect } from "vitest";

import { FetchConcurrencyGate } from "./fetchConcurrency.js";

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("FetchConcurrencyGate", () => {
  it("caps concurrent acquisitions per host", async () => {
    const gate = new FetchConcurrencyGate(10, 2); // per-host cap 2
    const granted = [];
    gate.acquire("ieee").then(() => granted.push(1));
    gate.acquire("ieee").then(() => granted.push(2));
    gate.acquire("ieee").then(() => granted.push(3)); // queued: ieee at cap 2
    await flush();
    expect(granted).toEqual([1, 2]);

    gate.release("ieee");
    await flush();
    expect(granted).toEqual([1, 2, 3]);
  });

  it("caps concurrent acquisitions globally across hosts", async () => {
    const gate = new FetchConcurrencyGate(3, 2); // global cap 3
    const granted = [];
    gate.acquire("a").then(() => granted.push("a"));
    gate.acquire("b").then(() => granted.push("b"));
    gate.acquire("c").then(() => granted.push("c"));
    gate.acquire("d").then(() => granted.push("d")); // queued: global at cap 3
    await flush();
    expect(granted).toEqual(["a", "b", "c"]);

    gate.release("a");
    await flush();
    expect(granted).toEqual(["a", "b", "c", "d"]);
  });

  it("skips a host-blocked head so another host is not stalled", async () => {
    const gate = new FetchConcurrencyGate(10, 1); // per-host cap 1
    const granted = [];
    gate.acquire("ieee").then(() => granted.push("ieee-1")); // granted
    gate.acquire("ieee").then(() => granted.push("ieee-2")); // queued: ieee at cap 1
    gate.acquire("plos").then(() => granted.push("plos-1")); // granted: different host
    await flush();
    expect(granted).toEqual(["ieee-1", "plos-1"]);
  });

  it("never exceeds caps and eventually drains a burst", async () => {
    const gate = new FetchConcurrencyGate(2, 2);
    let inFlight = 0;
    let peak = 0;
    const completed = [];

    const run = async (host, tag) => {
      await gate.acquire(host);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await flush(); // hold the slot briefly
      inFlight -= 1;
      completed.push(tag);
      gate.release(host);
    };

    await Promise.all([run("h", "1"), run("h", "2"), run("h", "3"), run("h", "4"), run("h", "5")]);

    expect(peak).toBeLessThanOrEqual(2); // global cap 2 respected under load
    expect(completed.sort()).toEqual(["1", "2", "3", "4", "5"]); // all drained
  });
});
