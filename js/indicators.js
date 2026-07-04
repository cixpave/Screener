/* Technical indicator math. All functions take an array of closing prices
   (oldest first) and return arrays aligned to the input; positions where the
   indicator is not yet defined hold null. */

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

  function ema(values, period, startIndex = 0) {
    const out = new Array(values.length).fill(null);
    const k = 2 / (period + 1);
    // seed with the SMA of the first full window
    if (values.length < startIndex + period) return out;
    let seed = 0;
    for (let i = startIndex; i < startIndex + period; i++) seed += values[i];
    let prev = seed / period;
    out[startIndex + period - 1] = prev;
    for (let i = startIndex + period; i < values.length; i++) {
      prev = values[i] * k + prev * (1 - k);
      out[i] = prev;
    }
    return out;
  }

  /* Wilder-smoothed RSI, the standard 14-period formulation. */
  function rsi(closes, period = 14) {
    const out = new Array(closes.length).fill(null);
    if (closes.length <= period) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d >= 0) gain += d; else loss -= d;
    }
    let avgGain = gain / period;
    let avgLoss = loss / period;
    out[period] = toRsi(avgGain, avgLoss);
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + Math.max(d, 0)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.max(-d, 0)) / period;
      out[i] = toRsi(avgGain, avgLoss);
    }
    return out;
  }

  function toRsi(avgGain, avgLoss) {
    if (avgLoss === 0) return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
  }

  /* MACD(12, 26, 9): returns { macd, signal, histogram } arrays. */
  function macd(closes, fast = 12, slow = 26, signalPeriod = 9) {
    const emaFast = ema(closes, fast);
    const emaSlow = ema(closes, slow);
    const macdLine = closes.map((_, i) =>
      emaFast[i] != null && emaSlow[i] != null ? emaFast[i] - emaSlow[i] : null);

    // signal = EMA of the macd line where it is defined
    const firstIdx = macdLine.findIndex(v => v != null);
    const signal = new Array(closes.length).fill(null);
    if (firstIdx >= 0) {
      const defined = macdLine.slice(firstIdx);
      const sig = ema(defined, signalPeriod);
      for (let i = 0; i < sig.length; i++) signal[firstIdx + i] = sig[i];
    }

    const histogram = macdLine.map((v, i) =>
      v != null && signal[i] != null ? v - signal[i] : null);

    return { macd: macdLine, signal, histogram };
  }

  /* Detect the most recent MACD/signal crossover within `lookback` bars.
     Returns { type: 'bull'|'bear', barsAgo } or null. */
  function lastCross(macdLine, signal, lookback = 5) {
    for (let ago = 0; ago < lookback; ago++) {
      const i = macdLine.length - 1 - ago;
      if (i < 1) break;
      const a = macdLine[i - 1], b = macdLine[i];
      const sa = signal[i - 1], sb = signal[i];
      if (a == null || sa == null || b == null || sb == null) continue;
      if (a <= sa && b > sb) return { type: 'bull', barsAgo: ago };
      if (a >= sa && b < sb) return { type: 'bear', barsAgo: ago };
    }
    return null;
  }

  return { sma, ema, rsi, macd, lastCross };
})();
