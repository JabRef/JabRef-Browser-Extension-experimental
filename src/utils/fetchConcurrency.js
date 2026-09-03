// fetchConcurrency.js
//
// req~bxf.concurrency-cap~1: publishers such as IEEE throttle parallel requests from one
// client (HTTP 420). This gate bounds how many fulltext fetches run at once — globally and
// per target host — and FIFO-queues the rest. Each fetch holds its slot for the whole
// tab-open / extract / download, then releases it.
//
// FIFO among requests that fit: a request whose host is at its cap is skipped so one
// throttled publisher cannot stall requests for another.

export class FetchConcurrencyGate {
  constructor(maxGlobal = 3, maxPerHost = 2) {
    this.maxGlobal = maxGlobal;
    this.maxPerHost = maxPerHost;
    this.globalActive = 0;
    this.hostActive = new Map(); // host -> in-flight count
    this.waiters = []; // FIFO queue of { host, resolve }
  }

  _available(host) {
    return this.globalActive < this.maxGlobal && (this.hostActive.get(host) || 0) < this.maxPerHost;
  }

  _take(host) {
    this.globalActive += 1;
    this.hostActive.set(host, (this.hostActive.get(host) || 0) + 1);
  }

  /// Resolves once a slot for `host` is free within the global and per-host caps.
  acquire(host) {
    return new Promise((resolve) => {
      if (this._available(host)) {
        this._take(host);
        resolve();
      } else {
        this.waiters.push({ host, resolve });
      }
    });
  }

  /// Releases the slot and admits every still-queued request that now fits.
  release(host) {
    this.globalActive = Math.max(0, this.globalActive - 1);
    const remaining = (this.hostActive.get(host) || 1) - 1;
    if (remaining <= 0) {
      this.hostActive.delete(host);
    } else {
      this.hostActive.set(host, remaining);
    }
    let i = 0;
    while (i < this.waiters.length) {
      if (this._available(this.waiters[i].host)) {
        const w = this.waiters.splice(i, 1)[0];
        this._take(w.host);
        w.resolve();
        i = 0; // capacities changed; re-scan from the front
      } else {
        i += 1;
      }
    }
  }
}
