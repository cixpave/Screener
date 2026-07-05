# Pulse — Market Screener

A modern, minimalist stock screener for new investors, styled with the Claude
color scheme (cream/ivory light mode, warm charcoal dark mode, Claude-orange
accent). No build step, no dependencies — open `index.html` in any browser.
Fully responsive: works as well on a phone as on a desktop.

## Features

- **Screener — the full S&P 500 (503 stocks)** with price, daily change,
  **RSI (14)**, **MACD (12, 26, 9)** state, a composite **bull/bear bias
  score**, and a 30-day sparkline. Preset screens (RSI oversold/overbought,
  MACD crosses, uptrend, bullish/bearish bias), a **filter for any individual
  signal**, sector filter, search, sortable columns, and paged loading.
- **Live quotes** — plug in a free API key (Connect → Live quotes) and prices
  update constantly: what's on screen and what you hold refreshes first, then
  the rest of the index cycles within the provider's free rate limit.
  Supported providers: **Finnhub** (real-time quotes) and **Twelve Data**
  (quotes + real daily OHLCV history, so candles and patterns compute on real
  bars when you open a stock — cached for the day). Signals are recomputed on
  every fresh quote, so the bias column stays honest. Without a key the app
  runs on clearly-labelled demo data.
- **Pattern tool on every chart** — open any stock and toggle overlays drawn
  directly on the candles: **swing points** (pivot highs/lows), fitted
  **trendlines**, clustered **support/resistance levels** (with touch
  counts), detected **chart patterns** (double top/bottom and head &
  shoulders with anchor points and necklines drawn and labelled), and
  **candle marks** (▲/▼ on every bar where a candlestick pattern fired — the
  crosshair names them).
- **~70-signal bull/bear engine** — every classic chart sign, each with a
  detector and a plain-English explanation:
  - *Momentum*: RSI overbought/oversold + bullish/bearish **divergence**,
    MACD crosses and zero-line state, slow **Stochastic** crosses,
    **Williams %R**, **CCI**, **rate of change** thrusts/slumps.
  - *Trend*: **golden cross / death cross** (50/200-day), 200-day position,
    stacked moving averages, **ADX** strong up/downtrends, **+DI/−DI**
    crosses, **Parabolic SAR** flips, **Ichimoku** cloud position and
    Tenkan/Kijun crosses.
  - *Volatility*: Bollinger band touches, **Bollinger squeeze**, ATR
    expansion.
  - *Volume*: **OBV** accumulation/distribution, 2× volume spikes, **Money
    Flow Index** extremes.
  - *Candlesticks*: hammer, hanging man, inverted hammer, shooting star,
    bullish/bearish **engulfing**, harami, piercing line, dark cloud cover,
    **morning/evening star**, three white soldiers, three black crows,
    tweezer top/bottom, doji.
  - *Chart patterns*: **double top/bottom**, **head & shoulders** (and
    inverse), ascending/descending **triangles**, rising/falling **wedges**,
    new 52-week high/low, gaps up/down.
- **Detail view** — click any row for a 3-month **candlestick chart** with
  SMA 20/50, Bollinger bands and a volume strip, plus dedicated RSI, MACD and
  Stochastic panes, crosshair tooltips, the full list of detected signals for
  that stock, and a plain-English readout aimed at beginners.
- **Learn tab** — a searchable library documenting every signal above (what
  it looks like, what it hints, which side it favors) with live "firing now"
  examples that jump straight to the chart.
- **Portfolio & suggestions** — track holdings (saved in your browser) and get
  rule-based observations: overbought/oversold warnings, MACD momentum shifts,
  trend caution, concentration risk, and heads-ups for upcoming events that
  affect what you hold. Every suggestion has a "Why?" explainer.
- **Events calendar** — the Fed's published 2026 FOMC meeting dates, plus CPI
  reports, jobs reports, and (estimated) earnings dates, each with a note on
  how that kind of event tends to move stocks.
- **Beginner tips** — a rotating tip bar and click-to-learn glossary popovers
  for RSI and MACD.
- **Light & dark themes** — follows your system preference, with a manual
  toggle. Chart colors are validated for color-vision-deficiency separation
  and contrast in both modes.

## Running it

```bash
# any static server works, e.g.:
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just double-click `index.html`.

## Deploying to Vercel

The repo is a pure static site (`vercel.json` included, no build step):

- **Dashboard**: [vercel.com/new](https://vercel.com/new) → Import this GitHub
  repo → leave every setting on its default (no framework, no build command)
  → Deploy. Vercel deploys the default branch to production and every other
  branch as a preview.
- **CLI**: `npx vercel` from the repo root (then `npx vercel --prod`).

## Data

Prices are **simulated demo data** (a seeded random walk, deterministic across
visits) so you can learn RSI and MACD risk-free. Every screen is labelled
accordingly. FOMC dates are the Fed's published 2026 schedule; CPI/jobs and
earnings dates are approximate.

## Connecting thinkorswim (Charles Schwab)

thinkorswim is part of Charles Schwab, and live data comes through the
[Schwab Trader API](https://developer.schwab.com) via OAuth:

1. Create a free developer account at **developer.schwab.com** and register an
   app with the *Market Data Production* product.
2. In Pulse, click **Connect thinkorswim**, paste your **App Key**, set the
   callback URL to match your app registration, and click **Authorize with
   Schwab** — this opens Schwab's official login page (your password is never
   entered in Pulse).
3. The Schwab API does not allow direct browser calls (CORS), so completing
   the token exchange and streaming quotes requires a small local proxy —
   a few lines of Node/Python that swap the OAuth `code` for tokens and relay
   `GET /marketdata/v1/quotes`. Until that's in place, Pulse clearly labels
   everything as demo data.

## Disclaimer

Pulse is an educational tool. Nothing it shows is financial advice. Technical
indicators describe the past and tilt probabilities — they do not predict the
future. Always do your own research.
