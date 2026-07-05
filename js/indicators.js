/* Technical indicator math. Series functions take arrays (oldest first) and
   return arrays aligned to the input; positions where the indicator is not
   yet defined hold null. */

const Indicators = (() => {

  function sma(values, period) {
    const out = new Array(values.length).fill(null);
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      if (i >= period - 1) out[i] = sum / period;
    }
    return out;
  }

  function ema(values, period) {
    const out = new Array(values.length).fill(null);
    const k = 2 / (period + 1);
    if (values.length < period) return out;
    let seed = 0;
    for (let i = 0; i < period; i++) seed += values[i];
    let prev = seed / period;
    out[period - 1] = prev;
    for (let i = period; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  /* Wilder smoothing (used by RSI, ATR, ADX) */
  function wilder(values, period) {
    const out = new Array(values.length).fill(null);
    if (values.length < period) return out;
    let seed = 0;
    for (let i = 0; i < period; i++) seed += values[i];
    let prev = seed / period;
    out[period - 1] = prev;
    for (let i = period; i < values.length; i++) {
      prev = (prev * (period - 1) + values[i]) / period;
      out[i] = prev;
    }
    return out;
  }

  /* ---------- momentum ---------- */

  function rsi(closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    if (closes.length <= period) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    let avgGain = gain / period, avgLoss = loss / period;
    const toRsi = (g, l) => (l === 0 ? 100 : 100 - 100 / (1 + g / l));
    out[period] = toRsi(avgGain, avgLoss);
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
      out[i] = toRsi(avgGain, avgLoss);
    }
    return out;
  }

  function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
    const emaFast = ema(closes, fast);
    const emaSlow = ema(closes, slow);
    const macdLine = closes.map((_, i) =>
      emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null);
    const firstIdx = macdLine.findIndex(v => v != null);
    const signal = new Array(closes.length).fill(null);
    if (firstIdx >= 0) {
      const sig = ema(macdLine.slice(firstIdx), signalPeriod);
      for (let i = 0; i < sig.length; i++) signal[firstIdx + i] = sig[i];
    }
    const histogram = macdLine.map((v, i) =>
      v != null && signal[i] != null ? v - signal[i] : null);
    return { macd: macdLine, signal, histogram };
  }

  /* Slow stochastic %K (14,3) and %D (3) */
  function stochastic(highs, lows, closes, kPeriod = 14, smooth = 3) {
    const fastK = new Array(closes.length).fill(null);
    for (let i = kPeriod - 1; i < closes.length; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - kPeriod + 1; j <= i; j++) {
        if (highs[j] > hh) hh = highs[j];
        if (lows[j] < ll) ll = lows[j];
      }
      fastK[i] = hh === ll ? 50 : (closes[i] - ll) / (hh - ll) * 100;
    }
    const k = smaSkipNull(fastK, smooth);
    const d = smaSkipNull(k, smooth);
    return { k, d };
  }

  /* Williams %R (14): like stochastic but scaled 0..-100 */
  function williamsR(highs, lows, closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - period + 1; j <= i; j++) {
        if (highs[j] > hh) hh = highs[j];
        if (lows[j] < ll) ll = lows[j];
      }
      out[i] = hh === ll ? -50 : (hh - closes[i]) / (hh - ll) * -100;
    }
    return out;
  }

  /* Commodity Channel Index (20) */
  function cci(highs, lows, closes, period = 20) {
    const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
    const tpSma = sma(tp, period);
    const out = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      let dev = 0;
      for (let j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j] - tpSma[i]);
      dev /= period;
      out[i] = dev === 0 ? 0 : (tp[i] - tpSma[i]) / (0.015 * dev);
    }
    return out;
  }

  /* Rate of change (%) over `period` bars */
  function roc(closes, period = 12) {
    return closes.map((c, i) => i >= period ? (c / closes[i - period] - 1) * 100 : null);
  }

  /* ---------- volatility / bands ---------- */

  function bollinger(closes, period = 20, mult = 2) {
    const mid = sma(closes, period);
    const upper = new Array(closes.length).fill(null);
    const lower = new Array(closes.length).fill(null);
    const bandwidth = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      let s = 0;
      for (let j = i - period + 1; j <= i; j++) s += (closes[j] - mid[i]) ** 2;
      const sd = Math.sqrt(s / period);
      upper[i] = mid[i] + mult * sd;
      lower[i] = mid[i] - mult * sd;
      bandwidth[i] = mid[i] === 0 ? 0 : (upper[i] - lower[i]) / mid[i];
    }
    return { upper, mid, lower, bandwidth };
  }

  function trueRange(highs, lows, closes) {
    return closes.map((c, i) => i === 0 ? highs[0] - lows[0] :
      Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }

  function atr(highs, lows, closes, period = 14) {
    return wilder(trueRange(highs, lows, closes), period);
  }

  /* ---------- trend ---------- */

  /* ADX with +DI / -DI (Wilder, 14) */
  function adx(highs, lows, closes, period = 14) {
    const n = closes.length;
    const tr = trueRange(highs, lows, closes);
    const pDM = new Array(n).fill(0), mDM = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      const up = highs[i] - highs[i - 1];
      const dn = lows[i - 1] - lows[i];
      if (up > dn && up > 0) pDM[i] = up;
      if (dn > up && dn > 0) mDM[i] = dn;
    }
    const sTR = wilder(tr.slice(1), period);
    const sP = wilder(pDM.slice(1), period);
    const sM = wilder(mDM.slice(1), period);
    const plusDI = new Array(n).fill(null), minusDI = new Array(n).fill(null), dx = [];
    for (let i = 0; i < sTR.length; i++) {
      if (sTR[i] == null || sTR[i] === 0) { dx.push(null); continue; }
      const p = sP[i] / sTR[i] * 100, m = sM[i] / sTR[i] * 100;
      plusDI[i + 1] = p; minusDI[i + 1] = m;
      dx.push(p + m === 0 ? 0 : Math.abs(p - m) / (p + m) * 100);
    }
    const firstDx = dx.findIndex(v => v != null);
    const adxOut = new Array(n).fill(null);
    if (firstDx >= 0) {
      const smoothed = wilder(dx.slice(firstDx), period);
      for (let i = 0; i < smoothed.length; i++)
        if (smoothed[i] != null) adxOut[firstDx + i + 1] = smoothed[i];
    }
    return { adx: adxOut, plusDI, minusDI };
  }

  /* Parabolic SAR. Returns sar values and trend (+1 up / -1 down). */
  function psar(highs, lows, step = 0.02, maxAf = 0.2) {
    const n = highs.length;
    const sar = new Array(n).fill(null), trend = new Array(n).fill(null);
    if (n < 2) return { sar, trend };
    let up = highs[1] + lows[1] > highs[0] + lows[0];
    let ep = up ? highs[1] : lows[1];
    let s = up ? lows[0] : highs[0];
    let af = step;
    sar[1] = s; trend[1] = up ? 1 : -1;
    for (let i = 2; i < n; i++) {
      s = s + af * (ep - s);
      if (up) {
        s = Math.min(s, lows[i - 1], lows[i - 2]);
        if (lows[i] < s) { up = false; s = ep; ep = lows[i]; af = step; }
        else if (highs[i] > ep) { ep = highs[i]; af = Math.min(af + step, maxAf); }
      } else {
        s = Math.max(s, highs[i - 1], highs[i - 2]);
        if (highs[i] > s) { up = true; s = ep; ep = highs[i]; af = step; }
        else if (lows[i] < ep) { ep = lows[i]; af = Math.min(af + step, maxAf); }
      }
      sar[i] = s; trend[i] = up ? 1 : -1;
    }
    return { sar, trend };
  }

  /* Ichimoku: tenkan(9), kijun(26), spans shifted forward 26 so spanA[i]/spanB[i]
     are the cloud boundaries in effect at bar i. */
  function ichimoku(highs, lows) {
    const mid = (p) => {
      const out = new Array(highs.length).fill(null);
      for (let i = p - 1; i < highs.length; i++) {
        let hh = -Infinity, ll = Infinity;
        for (let j = i - p + 1; j <= i; j++) {
          if (highs[j] > hh) hh = highs[j];
          if (lows[j] < ll) ll = lows[j];
        }
        out[i] = (hh + ll) / 2;
      }
      return out;
    };
    const tenkan = mid(9), kijun = mid(26), spanBraw = mid(52);
    const n = highs.length;
    const spanA = new Array(n).fill(null), spanB = new Array(n).fill(null);
    for (let i = 26; i < n; i++) {
      const a = tenkan[i - 26] != null && kijun[i - 26] != null
        ? (tenkan[i - 26] + kijun[i - 26]) / 2 : null;
      spanA[i] = a;
      spanB[i] = spanBraw[i - 26];
    }
    return { tenkan, kijun, spanA, spanB };
  }

  /* ---------- volume ---------- */

  function obv(closes, volumes) {
    const out = new Array(closes.length).fill(0);
    for (let i = 1; i < closes.length; i++) {
      out[i] = out[i - 1] +
        (closes[i] > closes[i - 1] ? volumes[i] : closes[i] < closes[i - 1] ? -volumes[i] : 0);
    }
    return out;
  }

  /* Money Flow Index (14) — volume-weighted RSI */
  function mfi(highs, lows, closes, volumes, period = 14) {
    const n = closes.length;
    const out = new Array(n).fill(null);
    const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
    for (let i = period; i < n; i++) {
      let pos = 0, neg = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const flow = tp[j] * volumes[j];
        if (tp[j] > tp[j - 1]) pos += flow;
        else if (tp[j] < tp[j - 1]) neg += flow;
      }
      out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
    }
    return out;
  }

  /* ---------- structure helpers ---------- */

  /* Detect the most recent crossover of series a over/under series b.
     Returns { type:'bull'|'bear', barsAgo } or null. */
  function lastCross(a, b, lookback = 5) {
    for (let ago = 0; ago < lookback; ago++) {
      const i = a.length - 1 - ago;
      if (i < 1) break;
      if (a[i - 1] == null || b[i - 1] == null || a[i] == null || b[i] == null) continue;
      if (a[i - 1] <= b[i - 1] && a[i] > b[i]) return { type: 'bull', barsAgo: ago };
      if (a[i - 1] >= b[i - 1] && a[i] < b[i]) return { type: 'bear', barsAgo: ago };
    }
    return null;
  }

  /* Swing pivots: local extremes over ±w bars. Returns [{i, v, type:'H'|'L'}]. */
  function pivots(values, w = 4) {
    const out = [];
    for (let i = w; i < values.length - w; i++) {
      let isH = true, isL = true;
      for (let j = i - w; j <= i + w; j++) {
        if (values[j] > values[i]) isH = false;
        if (values[j] < values[i]) isL = false;
        if (!isH && !isL) break;
      }
      if (isH) out.push({ i, v: values[i], type: 'H' });
      else if (isL) out.push({ i, v: values[i], type: 'L' });
    }
    return out;
  }

  /* Least-squares slope of points [{i, v}], as fraction-of-mean-value per bar. */
  function slope(points) {
    const n = points.length;
    if (n < 2) return 0;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (const p of points) { sx += p.i; sy += p.v; sxy += p.i * p.v; sxx += p.i * p.i; }
    const denom = n * sxx - sx * sx;
    if (denom === 0) return 0;
    const m = (n * sxy - sx * sy) / denom;
    const mean = sy / n;
    return mean === 0 ? 0 : m / mean;
  }

  /* SMA that starts as soon as `period` non-null values are available */
  function smaSkipNull(values, period) {
    const out = new Array(values.length).fill(null);
    for (let i = 0; i < values.length; i++) {
      if (values[i] == null) continue;
      let s = 0, cnt = 0;
      for (let j = i; j >= 0 && cnt < period; j--) {
        if (values[j] == null) break;
        s += values[j]; cnt++;
      }
      if (cnt === period) out[i] = s / period;
    }
    return out;
  }

  return {
    sma, ema, rsi, macd, stochastic, williamsR, cci, roc,
    bollinger, atr, adx, psar, ichimoku, obv, mfi,
    lastCross, pivots, slope,
  };
})();
