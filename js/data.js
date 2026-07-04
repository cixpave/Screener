/* Demo market data. Prices are simulated with a seeded random walk so the app
   is fully explorable (and deterministic) without a live connection. Every
   surface that shows these numbers is labelled "Demo data". */

const MarketData = (() => {

  const UNIVERSE = [
    { t: 'AAPL', name: 'Apple',              sector: 'Technology',    px: 232, vol: 0.016, drift:  0.0004 },
    { t: 'MSFT', name: 'Microsoft',          sector: 'Technology',    px: 448, vol: 0.015, drift:  0.0005 },
    { t: 'NVDA', name: 'NVIDIA',             sector: 'Technology',    px: 172, vol: 0.028, drift:  0.0009 },
    { t: 'AMD',  name: 'Advanced Micro Devices', sector: 'Technology', px: 158, vol: 0.030, drift:  0.0003 },
    { t: 'INTC', name: 'Intel',              sector: 'Technology',    px: 24,  vol: 0.024, drift: -0.0004 },
    { t: 'GOOGL',name: 'Alphabet',           sector: 'Communication', px: 189, vol: 0.017, drift:  0.0004 },
    { t: 'META', name: 'Meta Platforms',     sector: 'Communication', px: 618, vol: 0.021, drift:  0.0006 },
    { t: 'NFLX', name: 'Netflix',            sector: 'Communication', px: 924, vol: 0.022, drift:  0.0005 },
    { t: 'DIS',  name: 'Walt Disney',        sector: 'Communication', px: 104, vol: 0.017, drift:  0.0001 },
    { t: 'T',    name: 'AT&T',               sector: 'Communication', px: 23,  vol: 0.012, drift:  0.0001 },
    { t: 'AMZN', name: 'Amazon',             sector: 'Consumer',      px: 218, vol: 0.019, drift:  0.0005 },
    { t: 'TSLA', name: 'Tesla',              sector: 'Consumer',      px: 296, vol: 0.034, drift:  0.0002 },
    { t: 'HD',   name: 'Home Depot',         sector: 'Consumer',      px: 372, vol: 0.014, drift:  0.0002 },
    { t: 'WMT',  name: 'Walmart',            sector: 'Consumer',      px: 96,  vol: 0.011, drift:  0.0003 },
    { t: 'KO',   name: 'Coca-Cola',          sector: 'Consumer',      px: 68,  vol: 0.009, drift:  0.0001 },
    { t: 'PG',   name: 'Procter & Gamble',   sector: 'Consumer',      px: 166, vol: 0.009, drift:  0.0001 },
    { t: 'JPM',  name: 'JPMorgan Chase',     sector: 'Financials',    px: 262, vol: 0.014, drift:  0.0003 },
    { t: 'V',    name: 'Visa',               sector: 'Financials',    px: 334, vol: 0.012, drift:  0.0003 },
    { t: 'JNJ',  name: 'Johnson & Johnson',  sector: 'Healthcare',    px: 152, vol: 0.010, drift:  0.0001 },
    { t: 'UNH',  name: 'UnitedHealth',       sector: 'Healthcare',    px: 486, vol: 0.018, drift: -0.0002 },
    { t: 'PFE',  name: 'Pfizer',             sector: 'Healthcare',    px: 26,  vol: 0.014, drift: -0.0001 },
    { t: 'XOM',  name: 'Exxon Mobil',        sector: 'Energy',        px: 114, vol: 0.015, drift:  0.0002 },
    { t: 'CVX',  name: 'Chevron',            sector: 'Energy',        px: 152, vol: 0.014, drift:  0.0001 },
    { t: 'BA',   name: 'Boeing',             sector: 'Industrials',   px: 182, vol: 0.023, drift:  0.0002 },
  ];

  const BARS = 260;               // ~ one trading year of daily closes
  const SEED_EPOCH = 20260704;    // fixed so every visit shows the same demo tape

  /* mulberry32 — small deterministic PRNG */
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  /* Gaussian via Box–Muller */
  function gauss(rand) {
    const u = Math.max(rand(), 1e-9), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /* Generate a daily close series ending at roughly the anchor price,
     with occasional regime shifts so RSI/MACD signals actually appear. */
  function genSeries(spec) {
    const rand = rng(hash(spec.t) ^ SEED_EPOCH);
    const closes = [];
    let p = spec.px * (0.75 + rand() * 0.4);
    let regime = 0;
    for (let i = 0; i < BARS; i++) {
      if (rand() < 0.02) regime = (rand() - 0.5) * 0.004;   // multi-week trend shifts
      const shock = rand() < 0.01 ? (rand() - 0.5) * 0.10 : 0; // rare gap days
      p *= 1 + spec.drift + regime + shock + gauss(rand) * spec.vol;
      p = Math.max(p, 1);
      closes.push(p);
    }
    // scale so the final price lands near (not exactly on) the anchor
    const scale = spec.px * (0.97 + rand() * 0.06) / closes[closes.length - 1];
    return closes.map(c => +(c * scale).toFixed(2));
  }

  /* Trading-day dates ending today (skip weekends; holidays ignored for demo). */
  function genDates(n) {
    const dates = [];
    const d = new Date();
    while (dates.length < n) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) dates.push(new Date(d));
      d.setDate(d.getDate() - 1);
    }
    return dates.reverse();
  }

  const DATES = genDates(BARS);

  const STOCKS = UNIVERSE.map(spec => {
    const closes = genSeries(spec);
    const r = Indicators.rsi(closes);
    const m = Indicators.macd(closes);
    const sma20 = Indicators.sma(closes, 20);
    const sma50 = Indicators.sma(closes, 50);
    const last = closes.length - 1;
    const hi52 = Math.max(...closes);
    const lo52 = Math.min(...closes);
    const cross = Indicators.lastCross(m.macd, m.signal, 5);

    return {
      ...spec,
      closes,
      rsiSeries: r,
      macdSeries: m,
      sma20, sma50,
      price: closes[last],
      chg: (closes[last] / closes[last - 1] - 1) * 100,
      rsi: r[last],
      macd: m.macd[last],
      signal: m.signal[last],
      histogram: m.histogram[last],
      cross,
      hi52, lo52,
      off52: (closes[last] / hi52 - 1) * 100,
      uptrend: sma20[last] != null && sma50[last] != null &&
               closes[last] > sma20[last] && sma20[last] > sma50[last],
    };
  });

  const BY_TICKER = Object.fromEntries(STOCKS.map(s => [s.t, s]));

  /* ---------- market events ---------- */
  /* FOMC dates are the Fed's published 2026 schedule. CPI / jobs-report dates
     and earnings dates are approximate — always confirm before trading. */
  const EVENTS = [
    { date: '2026-07-14', kind: 'econ', title: 'CPI inflation report (June)',
      desc: 'The monthly Consumer Price Index. Hotter-than-expected inflation tends to hurt stocks (it makes rate cuts less likely); cooler numbers tend to help. Rate-sensitive tech and growth names react the most.',
      affects: ['NVDA','TSLA','AMD','META','AMZN'] },
    { date: '2026-07-17', kind: 'earnings', title: 'Netflix earnings (est.)',
      desc: 'Quarterly results after the close. Earnings days are the single most common cause of big one-day moves in an individual stock.',
      affects: ['NFLX'] },
    { date: '2026-07-22', kind: 'earnings', title: 'Tesla earnings (est.)',
      desc: 'Deliveries are already known, so the focus is margins and guidance. Tesla routinely moves 5–10% on earnings — new investors should expect volatility.',
      affects: ['TSLA'] },
    { date: '2026-07-28', kind: 'fed', title: 'FOMC meeting (day 1 of 2)',
      desc: 'The Federal Reserve\'s rate-setting committee meets. The decision and press conference land on day 2 at 2:00 pm ET — markets often churn quietly until then.',
      affects: 'ALL' },
    { date: '2026-07-29', kind: 'fed', title: 'FOMC rate decision + press conference',
      desc: 'Interest-rate decision at 2:00 pm ET, Chair press conference at 2:30. Rate changes (or hints about future ones) move nearly everything: higher rates pressure growth stocks, banks are sensitive to the rate path, and dividend payers compete with bond yields.',
      affects: 'ALL' },
    { date: '2026-07-30', kind: 'earnings', title: 'Apple & Amazon earnings (est.)',
      desc: 'Two mega-caps report the same week as the Fed — a historically choppy stretch for index funds too, since these names are big index weights.',
      affects: ['AAPL','AMZN'] },
    { date: '2026-08-07', kind: 'econ', title: 'Jobs report (July)',
      desc: 'Nonfarm payrolls, 8:30 am ET. A very weak or very strong labor market shifts expectations for Fed policy, so the whole market can gap at the open.',
      affects: 'ALL' },
    { date: '2026-08-12', kind: 'econ', title: 'CPI inflation report (July)',
      desc: 'Monthly inflation reading; see July\'s note. Watch core CPI (excludes food and energy) — it\'s what the Fed focuses on.',
      affects: ['NVDA','TSLA','AMD','META','AMZN'] },
    { date: '2026-08-27', kind: 'earnings', title: 'NVIDIA earnings (est.)',
      desc: 'The most-watched earnings report in the market. Options pricing typically implies a high single digit percent move; suppliers and AI-adjacent names (AMD, MSFT, META) often move in sympathy.',
      affects: ['NVDA','AMD','MSFT','META'] },
    { date: '2026-09-15', kind: 'fed', title: 'FOMC meeting (day 1 of 2)',
      desc: 'Fed meeting begins. September meetings include updated economic projections (the "dot plot"), which often move markets more than the rate decision itself.',
      affects: 'ALL' },
    { date: '2026-09-16', kind: 'fed', title: 'FOMC rate decision + projections',
      desc: 'Decision plus the quarterly Summary of Economic Projections. The dot plot shows where officials think rates are heading — surprises there ripple through everything.',
      affects: 'ALL' },
    { date: '2026-10-27', kind: 'fed', title: 'FOMC meeting (day 1 of 2)',
      desc: 'Fed meeting begins; decision lands the next afternoon.',
      affects: 'ALL' },
    { date: '2026-10-28', kind: 'fed', title: 'FOMC rate decision + press conference',
      desc: 'Rate decision at 2:00 pm ET. Falls in the middle of Q3 earnings season, so expect a busy week.',
      affects: 'ALL' },
    { date: '2026-12-08', kind: 'fed', title: 'FOMC meeting (day 1 of 2)',
      desc: 'The Fed\'s final meeting of 2026 begins.',
      affects: 'ALL' },
    { date: '2026-12-09', kind: 'fed', title: 'FOMC rate decision + projections',
      desc: 'Final decision of the year, with updated projections. December can also see "tax-loss selling" pressure on the year\'s losers.',
      affects: 'ALL' },
  ];

  const TIPS = [
    'RSI below 30 means a stock fell hard and fast — it flags stretched selling, not an automatic buy. Strong stocks can stay oversold for weeks.',
    'A MACD bullish cross is more reliable when the price is also above its 50-day average — momentum plus trend beats momentum alone.',
    'Never put more than you can afford to lose into a single stock. Many pros cap any one position at 5–10% of the portfolio.',
    'Earnings dates move individual stocks; Fed meetings move everything. Check the Events tab before you place a trade.',
    'Limit orders let you set your price. Market orders during volatile moments (like 2:00 pm on Fed day) can fill far from the last quote.',
    'Overbought (RSI above 70) is common in strong uptrends. It warns against chasing — it does not, by itself, predict a crash.',
    'Indicators describe the past. They tilt the odds; they never guarantee the future. Position sizing is what protects you when they\'re wrong.',
    'Dollar-cost averaging — buying a fixed amount on a schedule — removes the pressure of timing the market perfectly.',
    'The MACD histogram shrinking toward zero often warns of a momentum shift before the lines actually cross.',
    'Diversify across sectors: tech, healthcare, energy and consumer stocks often move on different news.',
  ];

  const GLOSSARY = {
    rsi: {
      title: 'RSI — Relative Strength Index',
      body: 'A 0–100 momentum gauge over the last 14 days. Above 70: the stock has risen unusually fast ("overbought"). Below 30: it has fallen unusually fast ("oversold"). It measures speed of movement, not whether a company is good or bad.'
    },
    macd: {
      title: 'MACD — Moving Average Convergence Divergence',
      body: 'Follows momentum by comparing a fast (12-day) and slow (26-day) average of price. When the MACD line crosses above its 9-day signal line, momentum is turning up (bullish); crossing below is bearish. The histogram shows the gap between the two lines.'
    },
  };

  return { STOCKS, BY_TICKER, DATES, EVENTS, TIPS, GLOSSARY };
})();
