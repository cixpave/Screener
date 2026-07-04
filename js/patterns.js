/* Signal registry: every bull/bear chart sign the screener knows.
   Each definition has a detector run against a stock's full series, plus a
   beginner-friendly blurb used by the Learn library. Sides: 'bull', 'bear',
   'neutral'. Weight feeds the composite bias score. */

const Signals = (() => {
  const I = Indicators;
  const last = arr => arr[arr.length - 1];
  const at = (arr, ago) => arr[arr.length - 1 - ago];
  const pct = n => (n > 0 ? '+' : '') + n.toFixed(1) + '%';

  /* ---------- candlestick helpers ---------- */

  function bar(s, i) {
    const o = s.opens[i], h = s.highs[i], l = s.lows[i], c = s.closes[i];
    const body = Math.abs(c - o), range = Math.max(h - l, 1e-9);
    return {
      o, h, l, c, body, range,
      upper: h - Math.max(o, c),
      lower: Math.min(o, c) - l,
      bull: c > o, bear: c < o,
    };
  }
  const inDowntrend = (s, i) => s.sma20[i] != null && s.closes[i] < s.sma20[i];
  const inUptrend   = (s, i) => s.sma20[i] != null && s.closes[i] > s.sma20[i];

  /* Scan the last `span` completed bars, newest first; det(i) returns a note
     or null. Reports the most recent hit with "x day(s) ago" appended. */
  function scanRecent(s, det, span = 3) {
    const n = s.closes.length;
    for (let ago = 0; ago < span; ago++) {
      const i = n - 1 - ago;
      if (i < 3) break;
      const note = det(i);
      if (note) return note + (ago === 0 ? ' (today)' : ` (${ago} day${ago > 1 ? 's' : ''} ago)`);
    }
    return null;
  }

  /* ---------- chart-pattern helpers ---------- */

  function recentPivots(s, window = 180, w = 4) {
    const n = s.closes.length;
    const start = Math.max(0, n - window);
    return I.pivots(s.closes.slice(start), w).map(p => ({ ...p, i: p.i + start }));
  }

  function trendlines(s, window = 60) {
    const n = s.closes.length;
    const start = n - window;
    const highs = [], lows = [];
    for (const p of I.pivots(s.highs.slice(start), 3)) if (p.type === 'H') highs.push({ i: p.i, v: p.v });
    for (const p of I.pivots(s.lows.slice(start), 3))  if (p.type === 'L') lows.push({ i: p.i, v: p.v });
    if (highs.length < 2 || lows.length < 2) return null;
    return { hSlope: I.slope(highs), lSlope: I.slope(lows), nH: highs.length, nL: lows.length };
  }

  /* ---------- divergence ---------- */

  function divergence(s, kind) {
    // compare the two most recent price pivot lows (bull) or highs (bear)
    // against the oscillator at the same bars
    const n = s.closes.length;
    const piv = recentPivots(s, 60, 3).filter(p => p.type === (kind === 'bull' ? 'L' : 'H'));
    if (piv.length < 2) return null;
    const p2 = piv[piv.length - 1], p1 = piv[piv.length - 2];
    if (n - 1 - p2.i > 12 || p2.i - p1.i < 6) return null;
    const r1 = s.rsiSeries[p1.i], r2 = s.rsiSeries[p2.i];
    if (r1 == null || r2 == null) return null;
    if (kind === 'bull' && p2.v < p1.v * 0.995 && r2 > r1 + 2)
      return `price made a lower low but RSI made a higher low (${r1.toFixed(0)} → ${r2.toFixed(0)})`;
    if (kind === 'bear' && p2.v > p1.v * 1.005 && r2 < r1 - 2)
      return `price made a higher high but RSI made a lower high (${r1.toFixed(0)} → ${r2.toFixed(0)})`;
    return null;
  }

  /* =========================================================
     THE REGISTRY
     ========================================================= */

  const DEFS = [

    /* ================= MOMENTUM ================= */
    {
      id: 'rsi-oversold', name: 'RSI oversold', cat: 'Momentum', side: 'bull', weight: 1,
      blurb: 'RSI below 30: the stock fell unusually hard over the last 14 days. Contrarians watch for a bounce — but oversold can stay oversold, so it hints rather than promises.',
      detect: s => s.rsi != null && s.rsi < 30 ? `RSI ${s.rsi.toFixed(0)}, below the 30 line` : null,
    },
    {
      id: 'rsi-overbought', name: 'RSI overbought', cat: 'Momentum', side: 'bear', weight: 1,
      blurb: 'RSI above 70: the stock rose unusually fast. A caution against chasing — strong uptrends can stay overbought for weeks, but the easy part of the move may be done.',
      detect: s => s.rsi != null && s.rsi > 70 ? `RSI ${s.rsi.toFixed(0)}, above the 70 line` : null,
    },
    {
      id: 'rsi-bull-div', name: 'Bullish RSI divergence', cat: 'Momentum', side: 'bull', weight: 2,
      blurb: 'Price sets a lower low while RSI sets a higher low — selling pressure is fading even as the price ticks lower. A classic early-reversal hint.',
      detect: s => divergence(s, 'bull'),
    },
    {
      id: 'rsi-bear-div', name: 'Bearish RSI divergence', cat: 'Momentum', side: 'bear', weight: 2,
      blurb: 'Price sets a higher high while RSI sets a lower high — the rally is losing steam underneath. Often precedes a pullback.',
      detect: s => divergence(s, 'bear'),
    },
    {
      id: 'macd-bull-cross', name: 'MACD bullish cross', cat: 'Momentum', side: 'bull', weight: 2,
      blurb: 'The MACD line crosses above its signal line: short-term momentum is turning up. Stronger when it happens below zero (a turn from depressed levels) or with the trend.',
      detect: s => s.cross?.type === 'bull'
        ? `MACD crossed above its signal ${s.cross.barsAgo === 0 ? 'today' : s.cross.barsAgo + ' day(s) ago'}` : null,
    },
    {
      id: 'macd-bear-cross', name: 'MACD bearish cross', cat: 'Momentum', side: 'bear', weight: 2,
      blurb: 'The MACD line crosses below its signal line: momentum is rolling over. Many traders treat it as a "tighten up" flag rather than an automatic sell.',
      detect: s => s.cross?.type === 'bear'
        ? `MACD crossed below its signal ${s.cross.barsAgo === 0 ? 'today' : s.cross.barsAgo + ' day(s) ago'}` : null,
    },
    {
      id: 'macd-above-zero', name: 'MACD above zero', cat: 'Momentum', side: 'bull', weight: 1,
      blurb: 'Both MACD conditions positive — the line above zero AND above its signal. The 12-day average is pulling away from the 26-day on the upside: established upward momentum.',
      detect: s => s.macd != null && s.macd > 0 && s.macd > s.signal ? 'MACD positive and above its signal line' : null,
    },
    {
      id: 'macd-below-zero', name: 'MACD below zero', cat: 'Momentum', side: 'bear', weight: 1,
      blurb: 'MACD below zero and below its signal line: downward momentum is established. Rallies inside this state often fade.',
      detect: s => s.macd != null && s.macd < 0 && s.macd < s.signal ? 'MACD negative and below its signal line' : null,
    },
    {
      id: 'stoch-bull-cross', name: 'Stochastic bullish cross', cat: 'Momentum', side: 'bull', weight: 1,
      blurb: '%K crosses above %D while in the oversold zone (below 25). The stochastic measures where price sits in its recent range — a turn up from the bottom of the range is a bounce signal.',
      detect: s => {
        const c = I.lastCross(s.stoch.k, s.stoch.d, 4);
        return c?.type === 'bull' && at(s.stoch.k, c.barsAgo) < 30
          ? `%K crossed above %D at ${at(s.stoch.k, c.barsAgo).toFixed(0)}` : null;
      },
    },
    {
      id: 'stoch-bear-cross', name: 'Stochastic bearish cross', cat: 'Momentum', side: 'bear', weight: 1,
      blurb: '%K crosses below %D in the overbought zone (above 75): price is turning down from the top of its recent range.',
      detect: s => {
        const c = I.lastCross(s.stoch.k, s.stoch.d, 4);
        return c?.type === 'bear' && at(s.stoch.k, c.barsAgo) > 70
          ? `%K crossed below %D at ${at(s.stoch.k, c.barsAgo).toFixed(0)}` : null;
      },
    },
    {
      id: 'willr-oversold', name: 'Williams %R oversold', cat: 'Momentum', side: 'bull', weight: 1,
      blurb: 'Williams %R below −80: price is pinned to the bottom of its 14-day range. A cousin of the stochastic; readings this washed-out often precede a relief bounce.',
      detect: s => last(s.willr) != null && last(s.willr) < -80 ? `%R at ${last(s.willr).toFixed(0)}` : null,
    },
    {
      id: 'willr-overbought', name: 'Williams %R overbought', cat: 'Momentum', side: 'bear', weight: 1,
      blurb: 'Williams %R above −20: price is pinned to the top of its 14-day range — stretched to the upside.',
      detect: s => last(s.willr) != null && last(s.willr) > -20 ? `%R at ${last(s.willr).toFixed(0)}` : null,
    },
    {
      id: 'cci-strong', name: 'CCI breakout strength', cat: 'Momentum', side: 'bull', weight: 1,
      blurb: 'CCI above +100: price is running well above its typical average — the way trend-followers read the start of a strong up-move.',
      detect: s => last(s.cciSeries) != null && last(s.cciSeries) > 100 ? `CCI at ${last(s.cciSeries).toFixed(0)}` : null,
    },
    {
      id: 'cci-weak', name: 'CCI breakdown weakness', cat: 'Momentum', side: 'bear', weight: 1,
      blurb: 'CCI below −100: price is running well below its typical average — momentum firmly negative.',
      detect: s => last(s.cciSeries) != null && last(s.cciSeries) < -100 ? `CCI at ${last(s.cciSeries).toFixed(0)}` : null,
    },
    {
      id: 'roc-thrust', name: 'Momentum thrust (ROC)', cat: 'Momentum', side: 'bull', weight: 1,
      blurb: 'Rate of change: price is up more than 8% over the last 12 sessions. Strong thrusts tend to continue in the short run (momentum persists more often than it reverses).',
      detect: s => last(s.rocSeries) != null && last(s.rocSeries) > 8 ? `${pct(last(s.rocSeries))} in 12 sessions` : null,
    },
    {
      id: 'roc-slump', name: 'Momentum slump (ROC)', cat: 'Momentum', side: 'bear', weight: 1,
      blurb: 'Rate of change: price is down more than 8% over the last 12 sessions — heavy near-term downside momentum.',
      detect: s => last(s.rocSeries) != null && last(s.rocSeries) < -8 ? `${pct(last(s.rocSeries))} in 12 sessions` : null,
    },

    /* ================= TREND ================= */
    {
      id: 'golden-cross', name: 'Golden cross', cat: 'Trend', side: 'bull', weight: 3,
      blurb: 'The 50-day average crosses above the 200-day. The most famous long-term bull signal — it says the intermediate trend has overtaken the long-term one. Slow, but historically respected.',
      detect: s => {
        const c = I.lastCross(s.sma50, s.sma200, 15);
        return c?.type === 'bull' ? `50-day SMA crossed above the 200-day ${c.barsAgo} day(s) ago` : null;
      },
    },
    {
      id: 'death-cross', name: 'Death cross', cat: 'Trend', side: 'bear', weight: 3,
      blurb: 'The 50-day average crosses below the 200-day — the bearish mirror of the golden cross. It often arrives late, but it marks a deteriorated long-term trend.',
      detect: s => {
        const c = I.lastCross(s.sma50, s.sma200, 15);
        return c?.type === 'bear' ? `50-day SMA crossed below the 200-day ${c.barsAgo} day(s) ago` : null;
      },
    },
    {
      id: 'above-sma200', name: 'Above the 200-day average', cat: 'Trend', side: 'bull', weight: 1,
      blurb: 'Price above its 200-day moving average — the simplest definition of a long-term uptrend. Many investors only buy names above this line.',
      detect: s => last(s.sma200) != null && s.price > last(s.sma200)
        ? `${pct((s.price / last(s.sma200) - 1) * 100)} above the 200-day SMA` : null,
    },
    {
      id: 'below-sma200', name: 'Below the 200-day average', cat: 'Trend', side: 'bear', weight: 1,
      blurb: 'Price below its 200-day moving average: the long-term trend is down. Bounces in this state are fighting the tide.',
      detect: s => last(s.sma200) != null && s.price < last(s.sma200)
        ? `${pct((s.price / last(s.sma200) - 1) * 100)} vs the 200-day SMA` : null,
    },
    {
      id: 'ma-stack-bull', name: 'Stacked averages (bullish)', cat: 'Trend', side: 'bull', weight: 1,
      blurb: 'Price > 20-day > 50-day: short, medium and longer averages in ascending order — the textbook picture of a healthy uptrend.',
      detect: s => s.uptrend ? 'price above the 20-day, 20-day above the 50-day' : null,
    },
    {
      id: 'ma-stack-bear', name: 'Stacked averages (bearish)', cat: 'Trend', side: 'bear', weight: 1,
      blurb: 'Price < 20-day < 50-day: averages stacked downward — the textbook downtrend. Trend-followers stay away until the stack repairs.',
      detect: s => {
        const s20 = last(s.sma20), s50 = last(s.sma50);
        return s20 != null && s50 != null && s.price < s20 && s20 < s50
          ? 'price below the 20-day, 20-day below the 50-day' : null;
      },
    },
    {
      id: 'adx-trend-up', name: 'Strong uptrend (ADX)', cat: 'Trend', side: 'bull', weight: 2,
      blurb: 'ADX above 25 with +DI leading −DI: not just an uptrend, a strong one. ADX measures trend strength; above 25 means the move has real energy behind it.',
      detect: s => {
        const a = last(s.adxData.adx), p = last(s.adxData.plusDI), m = last(s.adxData.minusDI);
        return a != null && a > 25 && p > m ? `ADX ${a.toFixed(0)} with +DI ${p.toFixed(0)} over −DI ${m.toFixed(0)}` : null;
      },
    },
    {
      id: 'adx-trend-down', name: 'Strong downtrend (ADX)', cat: 'Trend', side: 'bear', weight: 2,
      blurb: 'ADX above 25 with −DI leading +DI: a strong, energetic downtrend. "Don\'t catch a falling knife" applies most when ADX confirms the fall has force.',
      detect: s => {
        const a = last(s.adxData.adx), p = last(s.adxData.plusDI), m = last(s.adxData.minusDI);
        return a != null && a > 25 && m > p ? `ADX ${a.toFixed(0)} with −DI ${m.toFixed(0)} over +DI ${p.toFixed(0)}` : null;
      },
    },
    {
      id: 'di-bull-cross', name: '+DI / −DI bullish cross', cat: 'Trend', side: 'bull', weight: 1,
      blurb: 'The +DI line (upward movement) crosses above −DI (downward movement): buyers just took control by Wilder\'s directional system.',
      detect: s => {
        const c = I.lastCross(s.adxData.plusDI, s.adxData.minusDI, 5);
        return c?.type === 'bull' ? `+DI crossed above −DI ${c.barsAgo} day(s) ago` : null;
      },
    },
    {
      id: 'di-bear-cross', name: '+DI / −DI bearish cross', cat: 'Trend', side: 'bear', weight: 1,
      blurb: 'The −DI line crosses above +DI: sellers just took control by Wilder\'s directional system.',
      detect: s => {
        const c = I.lastCross(s.adxData.plusDI, s.adxData.minusDI, 5);
        return c?.type === 'bear' ? `−DI crossed above +DI ${c.barsAgo} day(s) ago` : null;
      },
    },
    {
      id: 'psar-flip-bull', name: 'Parabolic SAR flip (bullish)', cat: 'Trend', side: 'bull', weight: 1,
      blurb: 'The SAR dots flipped from above the price to below it — the stop-and-reverse system just switched to "long". Trend traders use the dots as a trailing stop.',
      detect: s => {
        const t = s.psarData.trend;
        for (let ago = 0; ago < 5; ago++) {
          const i = t.length - 1 - ago;
          if (i < 1 || t[i] == null || t[i - 1] == null) break;
          if (t[i] === 1 && t[i - 1] === -1) return `SAR flipped below price ${ago} day(s) ago`;
        }
        return null;
      },
    },
    {
      id: 'psar-flip-bear', name: 'Parabolic SAR flip (bearish)', cat: 'Trend', side: 'bear', weight: 1,
      blurb: 'The SAR dots flipped from below the price to above it — the stop-and-reverse system just switched to "short/step aside".',
      detect: s => {
        const t = s.psarData.trend;
        for (let ago = 0; ago < 5; ago++) {
          const i = t.length - 1 - ago;
          if (i < 1 || t[i] == null || t[i - 1] == null) break;
          if (t[i] === -1 && t[i - 1] === 1) return `SAR flipped above price ${ago} day(s) ago`;
        }
        return null;
      },
    },
    {
      id: 'ichi-above-cloud', name: 'Above the Ichimoku cloud', cat: 'Trend', side: 'bull', weight: 2,
      blurb: 'Price above the Ichimoku cloud (both spans): the Japanese all-in-one system reads the trend as up, with the cloud below acting as support.',
      detect: s => {
        const a = last(s.ichi.spanA), b = last(s.ichi.spanB);
        return a != null && b != null && s.price > Math.max(a, b) ? 'price above both cloud spans' : null;
      },
    },
    {
      id: 'ichi-below-cloud', name: 'Below the Ichimoku cloud', cat: 'Trend', side: 'bear', weight: 2,
      blurb: 'Price below the Ichimoku cloud: trend down, with the cloud overhead acting as resistance.',
      detect: s => {
        const a = last(s.ichi.spanA), b = last(s.ichi.spanB);
        return a != null && b != null && s.price < Math.min(a, b) ? 'price below both cloud spans' : null;
      },
    },
    {
      id: 'tk-bull-cross', name: 'Tenkan/Kijun bullish cross', cat: 'Trend', side: 'bull', weight: 1,
      blurb: 'Ichimoku\'s fast line (Tenkan, 9) crosses above its slow line (Kijun, 26) — the system\'s buy trigger, strongest when it happens above the cloud.',
      detect: s => {
        const c = I.lastCross(s.ichi.tenkan, s.ichi.kijun, 5);
        return c?.type === 'bull' ? `Tenkan crossed above Kijun ${c.barsAgo} day(s) ago` : null;
      },
    },
    {
      id: 'tk-bear-cross', name: 'Tenkan/Kijun bearish cross', cat: 'Trend', side: 'bear', weight: 1,
      blurb: 'Ichimoku\'s fast line crosses below its slow line — the system\'s sell trigger.',
      detect: s => {
        const c = I.lastCross(s.ichi.tenkan, s.ichi.kijun, 5);
        return c?.type === 'bear' ? `Tenkan crossed below Kijun ${c.barsAgo} day(s) ago` : null;
      },
    },

    /* ================= VOLATILITY & BANDS ================= */
    {
      id: 'bb-lower', name: 'Below the lower Bollinger band', cat: 'Volatility & bands', side: 'bull', weight: 1,
      blurb: 'Closing below the lower band (2 standard deviations under the 20-day average) is a statistically stretched move down. Mean-reversion traders look for a snap back — unless a strong downtrend is "riding the band".',
      detect: s => last(s.bb.lower) != null && s.price < last(s.bb.lower) ? 'close below the lower band' : null,
    },
    {
      id: 'bb-upper', name: 'Above the upper Bollinger band', cat: 'Volatility & bands', side: 'bear', weight: 1,
      blurb: 'Closing above the upper band is a statistically stretched move up. In ranges it hints at a pullback; in powerful uptrends price can "walk the band" — check trend signals before acting.',
      detect: s => last(s.bb.upper) != null && s.price > last(s.bb.upper) ? 'close above the upper band' : null,
    },
    {
      id: 'bb-squeeze', name: 'Bollinger squeeze', cat: 'Volatility & bands', side: 'neutral', weight: 0,
      blurb: 'The bands are the tightest they\'ve been in months: volatility is compressed. Squeezes don\'t say which way — they say a bigger move is loading. Watch for the breakout direction.',
      detect: s => {
        const bw = s.bb.bandwidth, cur = last(bw);
        if (cur == null) return null;
        let min = Infinity;
        for (let i = Math.max(0, bw.length - 120); i < bw.length - 1; i++)
          if (bw[i] != null && bw[i] < min) min = bw[i];
        return cur <= min * 1.05 ? 'band width at a multi-month low — volatility compressed' : null;
      },
    },
    {
      id: 'atr-expansion', name: 'Volatility expansion (ATR)', cat: 'Volatility & bands', side: 'neutral', weight: 0,
      blurb: 'Average True Range jumped well above its recent norm: daily swings are widening. Not directional, but position sizes that felt safe last month are riskier now.',
      detect: s => {
        const a = s.atrSeries, cur = last(a), prev = a[a.length - 21];
        return cur != null && prev != null && cur > prev * 1.5
          ? `ATR up ${pct((cur / prev - 1) * 100)} vs a month ago` : null;
      },
    },

    /* ================= VOLUME ================= */
    {
      id: 'obv-accum', name: 'OBV accumulation', cat: 'Volume', side: 'bull', weight: 1,
      blurb: 'On-balance volume is rising while price goes sideways or down: more volume flows on up days than down days. Reads as quiet accumulation — buyers building positions before the price shows it.',
      detect: s => {
        const o = s.obvSeries, n = o.length;
        if (n < 22) return null;
        const dObv = o[n - 1] - o[n - 21];
        const dPx = s.closes[n - 1] / s.closes[n - 21] - 1;
        return dObv > 0 && dPx < 0.01 ? 'OBV rising over 20 days while price is flat/down' : null;
      },
    },
    {
      id: 'obv-distrib', name: 'OBV distribution', cat: 'Volume', side: 'bear', weight: 1,
      blurb: 'On-balance volume is falling while price holds up: heavier volume on down days. Reads as distribution — sellers unloading into strength.',
      detect: s => {
        const o = s.obvSeries, n = o.length;
        if (n < 22) return null;
        const dObv = o[n - 1] - o[n - 21];
        const dPx = s.closes[n - 1] / s.closes[n - 21] - 1;
        return dObv < 0 && dPx > -0.01 ? 'OBV falling over 20 days while price is flat/up' : null;
      },
    },
    {
      id: 'vol-spike-up', name: 'High-volume up day', cat: 'Volume', side: 'bull', weight: 1,
      blurb: 'An up day on 2× average volume: conviction. Volume is the "how much do they mean it" gauge — big buying volume validates the move.',
      detect: s => {
        const n = s.volumes.length;
        const avg = last(s.volAvg20);
        return avg && s.volumes[n - 1] > 2 * avg && s.closes[n - 1] > s.opens[n - 1]
          ? `volume ${(s.volumes[n - 1] / avg).toFixed(1)}× the 20-day average on an up day` : null;
      },
    },
    {
      id: 'vol-spike-down', name: 'High-volume down day', cat: 'Volume', side: 'bear', weight: 1,
      blurb: 'A down day on 2× average volume: urgent selling. High-volume breakdowns are taken far more seriously than quiet drifts lower.',
      detect: s => {
        const n = s.volumes.length;
        const avg = last(s.volAvg20);
        return avg && s.volumes[n - 1] > 2 * avg && s.closes[n - 1] < s.opens[n - 1]
          ? `volume ${(s.volumes[n - 1] / avg).toFixed(1)}× the 20-day average on a down day` : null;
      },
    },
    {
      id: 'mfi-oversold', name: 'Money Flow Index oversold', cat: 'Volume', side: 'bull', weight: 1,
      blurb: 'MFI below 20 — the volume-weighted cousin of RSI. Money has been flowing out hard; washed-out readings often mark exhaustion lows.',
      detect: s => last(s.mfiSeries) != null && last(s.mfiSeries) < 20 ? `MFI ${last(s.mfiSeries).toFixed(0)}` : null,
    },
    {
      id: 'mfi-overbought', name: 'Money Flow Index overbought', cat: 'Volume', side: 'bear', weight: 1,
      blurb: 'MFI above 80: money has been flooding in unusually fast — enthusiasm is running hot.',
      detect: s => last(s.mfiSeries) != null && last(s.mfiSeries) > 80 ? `MFI ${last(s.mfiSeries).toFixed(0)}` : null,
    },

    /* ================= CANDLESTICKS ================= */
    {
      id: 'hammer', name: 'Hammer', cat: 'Candlesticks', side: 'bull', weight: 1,
      blurb: 'A small body with a long lower shadow after a decline: sellers pushed hard intraday, but buyers slammed it back up by the close. A one-bar hint that the low is being defended.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i);
        return inDowntrend(s, i) && b.lower >= 2 * b.body && b.upper <= 0.4 * b.body + 0.05 * b.range && b.body > 0
          ? 'long lower shadow after a decline' : null;
      }),
    },
    {
      id: 'hanging-man', name: 'Hanging man', cat: 'Candlesticks', side: 'bear', weight: 1,
      blurb: 'The same shape as a hammer, but after a rise: the intraday dumping shows sellers are getting active even though the close recovered. A warning shot at the top.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i);
        return inUptrend(s, i) && b.lower >= 2 * b.body && b.upper <= 0.4 * b.body + 0.05 * b.range && b.body > 0
          ? 'hammer shape after a rise — intraday selling appeared' : null;
      }),
    },
    {
      id: 'inverted-hammer', name: 'Inverted hammer', cat: 'Candlesticks', side: 'bull', weight: 1,
      blurb: 'A small body with a long upper shadow after a decline: buyers probed higher. Needs confirmation from the next candle, but it\'s an early bottoming tell.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i);
        return inDowntrend(s, i) && b.upper >= 2 * b.body && b.lower <= 0.4 * b.body + 0.05 * b.range && b.body > 0
          ? 'long upper shadow after a decline' : null;
      }),
    },
    {
      id: 'shooting-star', name: 'Shooting star', cat: 'Candlesticks', side: 'bear', weight: 1,
      blurb: 'A long upper shadow after a rise: buyers pushed to new highs intraday and got rejected hard. One of the most-watched single-bar topping signals.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i);
        return inUptrend(s, i) && b.upper >= 2 * b.body && b.lower <= 0.4 * b.body + 0.05 * b.range && b.body > 0
          ? 'high rejected with a long upper shadow' : null;
      }),
    },
    {
      id: 'bull-engulf', name: 'Bullish engulfing', cat: 'Candlesticks', side: 'bull', weight: 2,
      blurb: 'A big up candle whose body completely swallows the prior down candle\'s body: buyers overwhelmed everything sellers did the day before. Strongest after a decline.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i), p = bar(s, i - 1);
        return p.bear && b.bull && b.o <= p.c && b.c >= p.o && b.body > p.body
          ? 'up candle engulfed the prior down candle' : null;
      }),
    },
    {
      id: 'bear-engulf', name: 'Bearish engulfing', cat: 'Candlesticks', side: 'bear', weight: 2,
      blurb: 'A big down candle that swallows the prior up candle\'s body: sellers erased the previous day\'s optimism and then some. Strongest after a rise.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i), p = bar(s, i - 1);
        return p.bull && b.bear && b.o >= p.c && b.c <= p.o && b.body > p.body
          ? 'down candle engulfed the prior up candle' : null;
      }),
    },
    {
      id: 'bull-harami', name: 'Bullish harami', cat: 'Candlesticks', side: 'bull', weight: 1,
      blurb: 'A small up candle tucked inside the prior big down candle\'s body: the selling wave paused. Mild by itself — watch what follows.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i), p = bar(s, i - 1);
        return p.bear && b.bull && b.o > p.c && b.c < p.o && p.body > b.body * 1.6
          ? 'small up candle inside the prior down candle' : null;
      }),
    },
    {
      id: 'bear-harami', name: 'Bearish harami', cat: 'Candlesticks', side: 'bear', weight: 1,
      blurb: 'A small down candle inside the prior big up candle\'s body: the buying wave paused — momentum hesitation after a run-up.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i), p = bar(s, i - 1);
        return p.bull && b.bear && b.o < p.c && b.c > p.o && p.body > b.body * 1.6
          ? 'small down candle inside the prior up candle' : null;
      }),
    },
    {
      id: 'piercing-line', name: 'Piercing line', cat: 'Candlesticks', side: 'bull', weight: 1,
      blurb: 'After a down candle, the next opens lower but rallies to close above the midpoint of the previous body: dip-buyers reclaimed more than half the lost ground.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i), p = bar(s, i - 1);
        const mid = (p.o + p.c) / 2;
        return p.bear && b.bull && b.o < p.c && b.c > mid && b.c < p.o
          ? 'gap down reversed to close above the prior midpoint' : null;
      }),
    },
    {
      id: 'dark-cloud', name: 'Dark cloud cover', cat: 'Candlesticks', side: 'bear', weight: 1,
      blurb: 'After an up candle, the next opens higher but sells off to close below the midpoint of the previous body: the morning\'s optimism got sold hard.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i), p = bar(s, i - 1);
        const mid = (p.o + p.c) / 2;
        return p.bull && b.bear && b.o > p.c && b.c < mid && b.c > p.o
          ? 'gap up reversed to close below the prior midpoint' : null;
      }),
    },
    {
      id: 'morning-star', name: 'Morning star', cat: 'Candlesticks', side: 'bull', weight: 2,
      blurb: 'Three bars: a big down candle, a small indecision candle, then a big up candle closing well into the first one\'s body. A classic three-act bottom: capitulation → pause → reversal.',
      detect: s => scanRecent(s, i => {
        const a = bar(s, i - 2), m = bar(s, i - 1), b = bar(s, i);
        return a.bear && a.body > 0.5 * a.range && m.body < 0.5 * a.body &&
               b.bull && b.c > (a.o + a.c) / 2
          ? 'down candle → pause → strong up candle' : null;
      }),
    },
    {
      id: 'evening-star', name: 'Evening star', cat: 'Candlesticks', side: 'bear', weight: 2,
      blurb: 'Three bars: a big up candle, a small indecision candle, then a big down candle closing well into the first one\'s body. The three-act top: euphoria → pause → reversal.',
      detect: s => scanRecent(s, i => {
        const a = bar(s, i - 2), m = bar(s, i - 1), b = bar(s, i);
        return a.bull && a.body > 0.5 * a.range && m.body < 0.5 * a.body &&
               b.bear && b.c < (a.o + a.c) / 2
          ? 'up candle → pause → strong down candle' : null;
      }),
    },
    {
      id: 'three-soldiers', name: 'Three white soldiers', cat: 'Candlesticks', side: 'bull', weight: 2,
      blurb: 'Three consecutive solid up candles, each closing higher: steady, methodical buying across three sessions — one of the strongest short-term continuation patterns.',
      detect: s => scanRecent(s, i => {
        const a = bar(s, i - 2), m = bar(s, i - 1), b = bar(s, i);
        return a.bull && m.bull && b.bull &&
               m.c > a.c && b.c > m.c &&
               a.body > 0.5 * a.range && m.body > 0.5 * m.range && b.body > 0.5 * b.range
          ? 'three solid up candles in a row' : null;
      }, 1),
    },
    {
      id: 'three-crows', name: 'Three black crows', cat: 'Candlesticks', side: 'bear', weight: 2,
      blurb: 'Three consecutive solid down candles, each closing lower: persistent selling with no real bounce — a strong short-term bearish pattern.',
      detect: s => scanRecent(s, i => {
        const a = bar(s, i - 2), m = bar(s, i - 1), b = bar(s, i);
        return a.bear && m.bear && b.bear &&
               m.c < a.c && b.c < m.c &&
               a.body > 0.5 * a.range && m.body > 0.5 * m.range && b.body > 0.5 * b.range
          ? 'three solid down candles in a row' : null;
      }, 1),
    },
    {
      id: 'tweezer-bottom', name: 'Tweezer bottom', cat: 'Candlesticks', side: 'bull', weight: 1,
      blurb: 'Two candles with nearly identical lows — a down candle then an up candle: the same price level got bought twice. A short-term double-tap of support.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i), p = bar(s, i - 1);
        return p.bear && b.bull && Math.abs(b.l - p.l) / p.l < 0.0025 && inDowntrend(s, i - 1)
          ? `matching lows near $${b.l.toFixed(2)}` : null;
      }),
    },
    {
      id: 'tweezer-top', name: 'Tweezer top', cat: 'Candlesticks', side: 'bear', weight: 1,
      blurb: 'Two candles with nearly identical highs — an up candle then a down candle: the same level got sold twice. A short-term double-tap of resistance.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i), p = bar(s, i - 1);
        return p.bull && b.bear && Math.abs(b.h - p.h) / p.h < 0.0025 && inUptrend(s, i - 1)
          ? `matching highs near $${b.h.toFixed(2)}` : null;
      }),
    },
    {
      id: 'doji', name: 'Doji', cat: 'Candlesticks', side: 'neutral', weight: 0,
      blurb: 'Open and close nearly equal: a stand-off between buyers and sellers. After a strong trend, indecision itself is information — the side that was winning stopped winning.',
      detect: s => scanRecent(s, i => {
        const b = bar(s, i);
        return b.range > 0 && b.body <= 0.1 * b.range ? 'open and close nearly equal' : null;
      }, 1),
    },

    /* ================= CHART PATTERNS ================= */
    {
      id: 'double-bottom', name: 'Double bottom', cat: 'Chart patterns', side: 'bull', weight: 3,
      blurb: 'Price hits the same low twice with a bounce between (a "W"): sellers failed at the same level twice. Confirmed when price breaks above the middle peak (the neckline).',
      detect: s => {
        const piv = recentPivots(s);
        for (let k = piv.length - 1; k >= 2; k--) {
          const p3 = piv[k], p2 = piv[k - 1], p1 = piv[k - 2];
          if (p1.type !== 'L' || p2.type !== 'H' || p3.type !== 'L') continue;
          if (s.closes.length - 1 - p3.i > 40) break;
          if (Math.abs(p3.v - p1.v) / p1.v < 0.035 && p2.v > Math.max(p1.v, p3.v) * 1.03) {
            const status = s.price > p2.v ? 'confirmed — price broke the neckline' : 'forming — neckline not broken yet';
            return `two lows near $${p3.v.toFixed(2)}, ${status}`;
          }
        }
        return null;
      },
    },
    {
      id: 'double-top', name: 'Double top', cat: 'Chart patterns', side: 'bear', weight: 3,
      blurb: 'Price hits the same high twice with a dip between (an "M"): buyers failed at the same level twice. Confirmed when price breaks below the middle dip.',
      detect: s => {
        const piv = recentPivots(s);
        for (let k = piv.length - 1; k >= 2; k--) {
          const p3 = piv[k], p2 = piv[k - 1], p1 = piv[k - 2];
          if (p1.type !== 'H' || p2.type !== 'L' || p3.type !== 'H') continue;
          if (s.closes.length - 1 - p3.i > 40) break;
          if (Math.abs(p3.v - p1.v) / p1.v < 0.035 && p2.v < Math.min(p1.v, p3.v) * 0.97) {
            const status = s.price < p2.v ? 'confirmed — price broke the neckline' : 'forming — neckline not broken yet';
            return `two highs near $${p3.v.toFixed(2)}, ${status}`;
          }
        }
        return null;
      },
    },
    {
      id: 'inv-head-shoulders', name: 'Inverse head & shoulders', cat: 'Chart patterns', side: 'bull', weight: 3,
      blurb: 'Three troughs with the middle one deepest: the final low is higher than the "head" — sellers are losing their grip. Confirmed on a break above the neckline. One of the most reliable reversal patterns.',
      detect: s => {
        const lows = recentPivots(s).filter(p => p.type === 'L');
        if (lows.length < 3) return null;
        const [l1, head, l3] = lows.slice(-3);
        if (s.closes.length - 1 - l3.i > 40) return null;
        if (head.v < l1.v * 0.96 && head.v < l3.v * 0.96 && Math.abs(l3.v - l1.v) / l1.v < 0.06)
          return `head at $${head.v.toFixed(2)} with higher shoulders either side`;
        return null;
      },
    },
    {
      id: 'head-shoulders', name: 'Head & shoulders', cat: 'Chart patterns', side: 'bear', weight: 3,
      blurb: 'Three peaks with the middle one tallest: the last rally failed to reach the "head" — buyers are exhausting. Confirmed on a break below the neckline. The most famous topping pattern in charting.',
      detect: s => {
        const highs = recentPivots(s).filter(p => p.type === 'H');
        if (highs.length < 3) return null;
        const [h1, head, h3] = highs.slice(-3);
        if (s.closes.length - 1 - h3.i > 40) return null;
        if (head.v > h1.v * 1.04 && head.v > h3.v * 1.04 && Math.abs(h3.v - h1.v) / h1.v < 0.06)
          return `head at $${head.v.toFixed(2)} with lower shoulders either side`;
        return null;
      },
    },
    {
      id: 'ascending-triangle', name: 'Ascending triangle', cat: 'Chart patterns', side: 'bull', weight: 2,
      blurb: 'Flat resistance on top, rising lows underneath: buyers keep stepping in higher while sellers defend one price. Pressure builds — it usually resolves upward through the flat line.',
      detect: s => {
        const t = trendlines(s);
        return t && Math.abs(t.hSlope) < 0.0008 && t.lSlope > 0.0015
          ? 'flat highs with rising lows over the last 3 months' : null;
      },
    },
    {
      id: 'descending-triangle', name: 'Descending triangle', cat: 'Chart patterns', side: 'bear', weight: 2,
      blurb: 'Flat support underneath, falling highs above: sellers keep leaning in lower while buyers defend one price. It usually resolves downward through the flat line.',
      detect: s => {
        const t = trendlines(s);
        return t && Math.abs(t.lSlope) < 0.0008 && t.hSlope < -0.0015
          ? 'flat lows with falling highs over the last 3 months' : null;
      },
    },
    {
      id: 'rising-wedge', name: 'Rising wedge', cat: 'Chart patterns', side: 'bear', weight: 2,
      blurb: 'Price grinds higher inside two converging upward lines: each push gains less ground. Rising wedges lean bearish — the squeeze usually breaks down.',
      detect: s => {
        const t = trendlines(s);
        return t && t.hSlope > 0.0012 && t.lSlope > 0.0012 && t.lSlope > t.hSlope * 1.25
          ? 'converging rising trendlines — momentum narrowing' : null;
      },
    },
    {
      id: 'falling-wedge', name: 'Falling wedge', cat: 'Chart patterns', side: 'bull', weight: 2,
      blurb: 'Price slides lower inside two converging downward lines: each drop loses force. Falling wedges lean bullish — the squeeze usually breaks up.',
      detect: s => {
        const t = trendlines(s);
        return t && t.hSlope < -0.0012 && t.lSlope < -0.0012 && t.hSlope > t.lSlope * 1.25
          ? 'converging falling trendlines — selling force fading' : null;
      },
    },
    {
      id: 'new-52w-high', name: 'New 52-week high', cat: 'Chart patterns', side: 'bull', weight: 2,
      blurb: 'Breaking to a price no one has paid in a year: every holder is in profit, so there\'s no overhead "get me out at break-even" supply. Momentum investors treat new highs as a feature, not a warning.',
      detect: s => s.price >= s.hi52 * 0.995 ? `trading within 0.5% of the 52-week high ($${s.hi52.toFixed(2)})` : null,
    },
    {
      id: 'new-52w-low', name: 'New 52-week low', cat: 'Chart patterns', side: 'bear', weight: 2,
      blurb: 'Trading at a price lower than any in the past year: every buyer of the last 12 months is underwater. "Cheap" can keep getting cheaper — new lows tend to beget new lows.',
      detect: s => s.price <= s.lo52 * 1.005 ? `trading within 0.5% of the 52-week low ($${s.lo52.toFixed(2)})` : null,
    },
    {
      id: 'gap-up', name: 'Gap up (held)', cat: 'Chart patterns', side: 'bull', weight: 1,
      blurb: 'Price opened well above yesterday\'s close and held the gain: overnight news reset the price and buyers accepted it. Gaps that hold often mark the start of a re-rating.',
      detect: s => {
        const n = s.closes.length;
        return s.opens[n - 1] > s.closes[n - 2] * 1.02 && s.closes[n - 1] >= s.opens[n - 1] * 0.995
          ? `opened ${pct((s.opens[n - 1] / s.closes[n - 2] - 1) * 100)} and held it` : null;
      },
    },
    {
      id: 'gap-down', name: 'Gap down (held)', cat: 'Chart patterns', side: 'bear', weight: 1,
      blurb: 'Price opened well below yesterday\'s close and stayed weak: overnight news reset the price lower and no one stepped up. Unfilled gaps down are heavy.',
      detect: s => {
        const n = s.closes.length;
        return s.opens[n - 1] < s.closes[n - 2] * 0.98 && s.closes[n - 1] <= s.opens[n - 1] * 1.005
          ? `opened ${pct((s.opens[n - 1] / s.closes[n - 2] - 1) * 100)} and stayed down` : null;
      },
    },
  ];

  /* Run every detector against a stock. Returns fired signals + bias score. */
  function evaluate(stock) {
    const fired = [];
    let score = 0, bull = 0, bear = 0;
    for (const def of DEFS) {
      let note = null;
      try { note = def.detect(stock); } catch (_) { /* skip a detector that trips on edge data */ }
      if (!note) continue;
      fired.push({ id: def.id, name: def.name, cat: def.cat, side: def.side, weight: def.weight, note });
      if (def.side === 'bull') { score += def.weight; bull++; }
      else if (def.side === 'bear') { score -= def.weight; bear++; }
    }
    return { fired, score, bull, bear };
  }

  const CATEGORIES = ['Momentum', 'Trend', 'Volatility & bands', 'Volume', 'Candlesticks', 'Chart patterns'];

  return { DEFS, evaluate, CATEGORIES };
})();
