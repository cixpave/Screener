/* Live market data layer.
   A static page can't call brokerage APIs without keys, so Pulse supports two
   free-tier providers the user can plug in (keys stay in this browser):

   - Finnhub (finnhub.io)      — real-time quotes, ~60 requests/min free.
     Used to keep table prices constantly updating, prioritising what's on
     screen and what the user holds, then cycling the rest of the S&P 500.
   - Twelve Data (twelvedata.com) — daily OHLCV history, ~8 requests/min free.
     Used when a stock is opened, so candles/indicators/patterns compute on
     real bars instead of demo ones (cached for the day).

   Without keys the app runs on labelled demo data. */

const LiveData = (() => {
  const LS_KEYS = 'pulse.livekeys';
  const LS_HIST = 'pulse.hist';
  const HIST_CACHE_MAX = 12;

  let keys = { finnhub: '', twelvedata: '' };
  try { keys = { ...keys, ...JSON.parse(localStorage.getItem(LS_KEYS) || '{}') }; } catch (_) {}

  let onUpdate = () => {};
  let priority = [];            // tickers to refresh first (visible + held)
  let cycleIdx = 0;             // round-robin pointer over the full universe
  let timer = null;
  let backoffUntil = 0;
  let updatedCount = 0;
  let lastAt = null;
  const freshness = new Map(); // ticker -> last quote timestamp
  const histMem = new Map();

  const hasQuotes = () => !!(keys.finnhub || keys.twelvedata);
  const hasHistory = () => !!keys.twelvedata;

  function setKeys(next) {
    keys = { finnhub: (next.finnhub || '').trim(), twelvedata: (next.twelvedata || '').trim() };
    localStorage.setItem(LS_KEYS, JSON.stringify(keys));
    restart();
  }

  function setPriority(tickers) {
    priority = tickers;
  }

  /* Pick the next symbol: stalest priority ticker first (>60s old),
     otherwise continue the round-robin over everything. */
  function nextSymbol() {
    const now = Date.now();
    let stalest = null, stalestAge = -1;
    for (const t of priority) {
      const age = now - (freshness.get(t) || 0);
      if (age > 60000 && age > stalestAge) { stalest = t; stalestAge = age; }
    }
    if (stalest) return stalest;
    const all = MarketData.STOCKS;
    const t = all[cycleIdx % all.length].t;
    cycleIdx++;
    return t;
  }

  async function pollOnce() {
    if (Date.now() < backoffUntil) return;
    const t = nextSymbol();
    try {
      let price = null, prevClose = null;
      if (keys.finnhub) {
        const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(t)}&token=${encodeURIComponent(keys.finnhub)}`);
        if (r.status === 429) { backoffUntil = Date.now() + 61000; return; }
        const j = await r.json();
        if (j && j.c > 0) { price = j.c; prevClose = j.pc; }
      } else if (keys.twelvedata) {
        const r = await fetch(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(t)}&apikey=${encodeURIComponent(keys.twelvedata)}`);
        const j = await r.json();
        if (j && j.code === 429) { backoffUntil = Date.now() + 61000; return; }
        if (j && +j.close > 0) { price = +j.close; prevClose = +j.previous_close; }
      }
      if (price != null) {
        freshness.set(t, Date.now());
        MarketData.applyQuote(t, price, prevClose);
        updatedCount = freshness.size;
        lastAt = Date.now();
        onUpdate(t);
      }
    } catch (_) { /* network hiccup — next tick tries another symbol */ }
  }

  function restart() {
    if (timer) { clearInterval(timer); timer = null; }
    if (!hasQuotes()) { onUpdate(null); return; }
    // Finnhub free: 60/min → 1.1s cadence. Twelve Data free: 8/min → 8s.
    const cadence = keys.finnhub ? 1100 : 8000;
    timer = setInterval(pollOnce, cadence);
    pollOnce();
    onUpdate(null);
  }

  /* ---------- daily history (Twelve Data) ---------- */

  function todayKey() { return new Date().toISOString().slice(0, 10); }

  function histFromStorage(t) {
    try {
      const box = JSON.parse(localStorage.getItem(LS_HIST) || '{}');
      const e = box.entries?.[t];
      return e && e.date === todayKey() ? e.series : null;
    } catch (_) { return null; }
  }

  function histToStorage(t, series) {
    try {
      const box = JSON.parse(localStorage.getItem(LS_HIST) || '{}');
      box.entries = box.entries || {};
      box.order = (box.order || []).filter(x => x !== t);
      box.order.push(t);
      while (box.order.length > HIST_CACHE_MAX) delete box.entries[box.order.shift()];
      box.entries[t] = { date: todayKey(), series };
      localStorage.setItem(LS_HIST, JSON.stringify(box));
    } catch (_) { /* quota — in-memory cache still has it */ }
  }

  /* Fetch real daily OHLCV and swap it into the stock. Calls done(stock)
     if the stock was refreshed (from cache or network), done(null) if not. */
  async function ensureHistory(t, done) {
    if (!hasHistory()) { done(null); return; }
    const s = MarketData.BY_TICKER[t];
    if (!s) { done(null); return; }
    if (s.liveHistory) { done(s); return; }

    let series = histMem.get(t) || histFromStorage(t);
    if (!series) {
      try {
        const r = await fetch(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(t)}&interval=1day&outputsize=${MarketData.BARS}&apikey=${encodeURIComponent(keys.twelvedata)}`);
        const j = await r.json();
        if (!j || j.status === 'error' || !Array.isArray(j.values)) { done(null); return; }
        const vals = j.values.slice().reverse(); // oldest first
        series = {
          opens: vals.map(v => +v.open), highs: vals.map(v => +v.high),
          lows: vals.map(v => +v.low), closes: vals.map(v => +v.close),
          volumes: vals.map(v => +v.volume || 0),
        };
        histMem.set(t, series);
        histToStorage(t, series);
      } catch (_) { done(null); return; }
    } else {
      histMem.set(t, series);
    }
    done(MarketData.refreshFromCandles(t, series));
  }

  function status() {
    return {
      live: hasQuotes(),
      history: hasHistory(),
      provider: keys.finnhub ? 'Finnhub' : keys.twelvedata ? 'Twelve Data' : null,
      updatedCount, lastAt,
      backoff: Date.now() < backoffUntil,
    };
  }

  function init(opts) {
    onUpdate = opts.onUpdate || onUpdate;
    restart();
  }

  return { init, setKeys, getKeys: () => ({ ...keys }), setPriority, ensureHistory, status };
})();
