/* Pulse — app logic. Plain DOM + SVG, no dependencies. */

(() => {
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const fmtUsd = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (n, signed = true) =>
    (signed && n > 0 ? '+' : '') + n.toFixed(2) + '%';
  const arrow = n => (n >= 0 ? '▲' : '▼');
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const SIDE_GLYPH = { bull: '▲', bear: '▼', neutral: '◆' };

  /* ================= theme ================= */

  const themeToggle = $('#theme-toggle');
  const savedTheme = localStorage.getItem('pulse.theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;

  themeToggle.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme ||
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('pulse.theme', next);
    renderScreener();
    if (openTicker) renderDrawer(openTicker);
  });

  /* ================= tabs ================= */

  $$('.tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.tab').forEach(t => { t.classList.toggle('is-active', t === tab); t.setAttribute('aria-selected', t === tab); });
    $$('.view').forEach(v => v.classList.toggle('is-active', v.id === 'view-' + tab.dataset.view));
    if (tab.dataset.view === 'learn') renderLearn();
  }));

  /* ================= tip bar ================= */

  let tipIdx = Math.floor(Math.random() * MarketData.TIPS.length);
  const showTip = () => { $('#tipbar-text').textContent = MarketData.TIPS[tipIdx % MarketData.TIPS.length]; };
  $('#tipbar-next').addEventListener('click', () => { tipIdx++; showTip(); });
  showTip();
  setInterval(() => { tipIdx++; showTip(); }, 30000);

  /* ================= glossary popover ================= */

  const popover = $('#popover');
  document.addEventListener('click', e => {
    const btn = e.target.closest('.info-btn');
    if (btn) {
      e.stopPropagation();
      const term = MarketData.GLOSSARY[btn.dataset.term];
      popover.innerHTML = `<h4>${term.title}</h4><p>${term.body}</p>`;
      popover.hidden = false;
      const r = btn.getBoundingClientRect();
      popover.style.left = Math.max(8, Math.min(r.left, innerWidth - 320)) + scrollX + 'px';
      popover.style.top = r.bottom + 8 + scrollY + 'px';
      return;
    }
    if (!e.target.closest('.popover')) popover.hidden = true;
  });

  /* ================= screener ================= */

  const PAGE_SIZE = 60;
  const state = { preset: 'all', sector: '', search: '', signal: '', sortKey: 'ticker', sortDir: 1, page: 1 };
  // your screen settings come back the way you left them
  try {
    const saved = JSON.parse(localStorage.getItem('pulse.screen') || '{}');
    for (const k of ['preset', 'sector', 'signal', 'sortKey', 'sortDir'])
      if (saved[k] !== undefined) state[k] = saved[k];
  } catch (_) {}
  const saveScreenState = () => localStorage.setItem('pulse.screen', JSON.stringify(
    { preset: state.preset, sector: state.sector, signal: state.signal, sortKey: state.sortKey, sortDir: state.sortDir }));

  // populate sector filter + ticker datalist + signal filter
  const sectors = [...new Set(MarketData.STOCKS.map(s => s.sector)), 'ETF', 'Other (US)'].sort();
  for (const sec of sectors) {
    const o = document.createElement('option');
    o.value = o.textContent = sec;
    $('#sector-filter').appendChild(o);
  }
  for (const s of MarketData.STOCKS) {
    const o = document.createElement('option');
    o.value = s.t;
    o.label = s.name;
    $('#ticker-list').appendChild(o);
  }
  for (const cat of Signals.CATEGORIES) {
    const grp = document.createElement('optgroup');
    grp.label = cat;
    for (const def of Signals.DEFS.filter(d => d.cat === cat)) {
      const o = document.createElement('option');
      o.value = def.id;
      o.textContent = `${SIDE_GLYPH[def.side]} ${def.name}`;
      grp.appendChild(o);
    }
    $('#signal-filter').appendChild(grp);
  }

  const PRESETS = {
    all:        () => true,
    oversold:   s => s.rsi != null && s.rsi < 30,
    overbought: s => s.rsi != null && s.rsi > 70,
    bullcross:  s => s.cross && s.cross.type === 'bull',
    bearcross:  s => s.cross && s.cross.type === 'bear',
    uptrend:    s => s.uptrend,
    bullbias:   s => s.sig.score >= 3,
    bearbias:   s => s.sig.score <= -3,
  };

  function macdCell(s) {
    if (s.cross && s.cross.type === 'bull')
      return `<span class="tag tag-up">▲ Bullish cross</span>`;
    if (s.cross && s.cross.type === 'bear')
      return `<span class="tag tag-down">▼ Bearish cross</span>`;
    if (s.macd != null && s.signal != null && s.macd > s.signal)
      return `<span class="tag">Above signal</span>`;
    return `<span class="tag">Below signal</span>`;
  }

  function rsiCell(s) {
    if (s.rsi == null) return '—';
    const cls = s.rsi > 70 ? 'is-hi' : s.rsi < 30 ? 'is-lo' : '';
    return `<span class="rsi-cell">
      <span>${s.rsi.toFixed(0)}</span>
      <span class="rsi-meter ${cls}"><i style="width:${s.rsi.toFixed(0)}%"></i></span>
    </span>`;
  }

  function biasCell(s) {
    const { score, bull, bear } = s.sig;
    const badge = score >= 3 ? `<span class="tag tag-up">▲ Bullish ${score > 0 ? '+' + score : score}</span>`
      : score <= -3 ? `<span class="tag tag-down">▼ Bearish ${score}</span>`
      : `<span class="tag">Mixed ${score > 0 ? '+' + score : score}</span>`;
    return `<span class="bias-cell">${badge}<span class="bias-counts">${bull}▲ ${bear}▼</span></span>`;
  }

  function sparkline(closes) {
    const data = closes.slice(-30);
    const w = 110, h = 30, pad = 2;
    const min = Math.min(...data), max = Math.max(...data);
    const span = max - min || 1;
    const pts = data.map((v, i) =>
      `${(pad + i * (w - 2 * pad) / (data.length - 1)).toFixed(1)},` +
      `${(h - pad - (v - min) / span * (h - 2 * pad)).toFixed(1)}`).join(' ');
    const up = data[data.length - 1] >= data[0];
    const color = up ? cssVar('--up') : cssVar('--down');
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <polyline points="${pts}" fill="none" stroke="${cssVar('--spark')}" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="${pts.split(' ').pop().split(',')[0]}" cy="${pts.split(' ').pop().split(',')[1]}" r="2.5" fill="${color}"/>
    </svg>`;
  }

  const SORT_ACCESSORS = {
    ticker: s => s.t, name: s => s.name, price: s => s.price, chg: s => s.chg,
    rsi: s => s.rsi ?? -1, score: s => s.sig.score,
    macdState: s => (s.cross ? (s.cross.type === 'bull' ? 3 : 0) : (s.macd > s.signal ? 2 : 1)),
  };

  function filteredRows() {
    // pull matching symbols from the full US directory into the screener
    if (state.search) MarketData.searchDirectory(state.search).forEach(t => MarketData.ensureStock(t));
    let rows = MarketData.STOCKS.filter(PRESETS[state.preset]);
    if (state.sector) rows = rows.filter(s => s.sector === state.sector);
    if (state.signal) rows = rows.filter(s => s.sig.fired.some(f => f.id === state.signal));
    if (state.search) {
      const q = state.search.toUpperCase();
      rows = rows.filter(s => s.t.includes(q) || s.name.toUpperCase().includes(q));
    }
    const acc = SORT_ACCESSORS[state.sortKey];
    rows.sort((a, b) => {
      const va = acc(a), vb = acc(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * state.sortDir;
    });
    return rows;
  }

  function renderScreener() {
    const rows = filteredRows();
    const shown = rows.slice(0, state.page * PAGE_SIZE);

    $('#screener-body').innerHTML = shown.map(s => `
      <tr data-ticker="${s.t}">
        <td class="sym">${s.t}${s.liveQuote ? ' <span class="live-badge" title="Live quote"></span>' : ''}</td>
        <td class="co-name col-name">${s.name}</td>
        <td class="num">${fmtUsd(s.price)}</td>
        <td class="num ${s.chg >= 0 ? 'delta-up' : 'delta-down'}">${arrow(s.chg)} ${fmtPct(Math.abs(s.chg), false)}</td>
        <td class="num">${rsiCell(s)}</td>
        <td class="col-macd">${macdCell(s)}</td>
        <td class="col-bias">${biasCell(s)}</td>
        <td class="col-spark">${sparkline(s.closes)}</td>
      </tr>`).join('');

    $('#screener-empty').hidden = rows.length > 0;
    $('#result-count').textContent = rows.length
      ? `Showing ${shown.length} of ${rows.length} loaded · ${MarketData.DIRECTORY_COUNT.toLocaleString()} US symbols searchable` : '';
    $('#load-more').hidden = shown.length >= rows.length;

    $$('th[data-sort]').forEach(th => {
      th.classList.toggle('sorted-asc',  th.dataset.sort === state.sortKey && state.sortDir === 1);
      th.classList.toggle('sorted-desc', th.dataset.sort === state.sortKey && state.sortDir === -1);
    });

    // live layer refreshes what the user is actually looking at first
    LiveData.setPriority([...new Set([...activeHoldings().map(h => h.t), ...shown.slice(0, 120).map(s => s.t)])]);
  }

  const resetPage = () => { state.page = 1; };

  $('#load-more').addEventListener('click', () => { state.page++; renderScreener(); });

  $('#presets').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    state.preset = chip.dataset.preset;
    resetPage();
    $$('#presets .chip').forEach(c => c.classList.toggle('is-active', c === chip));
    saveScreenState();
    renderScreener();
  });
  $('#sector-filter').addEventListener('change', e => { state.sector = e.target.value; resetPage(); saveScreenState(); renderScreener(); });
  $('#signal-filter').addEventListener('change', e => { state.signal = e.target.value; resetPage(); saveScreenState(); renderScreener(); });
  $('#search').addEventListener('input', e => { state.search = e.target.value.trim(); resetPage(); renderScreener(); });
  $('#screener-table thead').addEventListener('click', e => {
    const th = e.target.closest('th[data-sort]');
    if (!th || e.target.closest('.info-btn')) return;
    if (state.sortKey === th.dataset.sort) state.sortDir *= -1;
    else { state.sortKey = th.dataset.sort; state.sortDir = 1; }
    resetPage();
    saveScreenState();
    renderScreener();
  });
  $('#screener-body').addEventListener('click', e => {
    const row = e.target.closest('tr[data-ticker]');
    if (row) openDrawer(row.dataset.ticker);
  });

  /* ================= drawer & charts ================= */

  const drawer = $('#drawer'), scrim = $('#drawer-scrim');
  let openTicker = null;

  function closeDrawer() { drawer.hidden = true; scrim.hidden = true; openTicker = null; }
  $('#drawer-close').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); $('#modal-scrim').hidden = true; } });

  const SHOW_BARS = 126;   // ~6 months for oscillator panes
  const CANDLE_BARS = 63;  // ~3 months for the candle pane

  /* Pattern tool toggles (persisted) */
  let patternTools = { swings: false, trendlines: false, levels: false, patterns: true, candles: true };
  try { patternTools = { ...patternTools, ...JSON.parse(localStorage.getItem('pulse.ptools') || '{}') }; } catch (_) {}

  function syncToolChips() {
    $$('#pattern-tools .chip').forEach(c =>
      c.classList.toggle('is-active', !!patternTools[c.dataset.tool]));
  }
  $('#pattern-tools').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    patternTools[chip.dataset.tool] = !patternTools[chip.dataset.tool];
    localStorage.setItem('pulse.ptools', JSON.stringify(patternTools));
    syncToolChips();
    if (openTicker) drawCandles($('#chart-price'), MarketData.BY_TICKER[openTicker]);
  });

  /* Shared hover/touch wiring for a chart pane. */
  function wireCrosshair(el, svgW, handler) {
    const svgEl = el.querySelector('svg'), tip = el.querySelector('.chart-tip'), xh = el.querySelector('#xhair');
    const move = e => {
      const rect = svgEl.getBoundingClientRect();
      const sx = (e.clientX - rect.left) / rect.width * svgW;
      handler(sx, e.clientY - rect.top, rect, tip, xh);
    };
    svgEl.addEventListener('pointermove', move);
    svgEl.addEventListener('pointerdown', move);
    // touch keeps the crosshair up after the finger lifts; mouse clears on exit
    svgEl.addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse') return;
      tip.hidden = true; xh.setAttribute('opacity', '0');
    });
  }

  /* Candlestick pane: candles + SMA20/50 + Bollinger wash + volume strip,
     plus the pattern-tool overlays. */
  function drawCandles(el, s) {
    const N = CANDLE_BARS;
    const n0 = s.closes.length - N;
    const dates = MarketData.DATES.slice(-N);
    const W = 520, H = 240, padL = 56, padR = 44, padT = 8, padB = 20, volH = 30;
    const plotB = H - padB - volH - 4;

    const ov = Signals.overlays(s, N);

    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < N; i++) {
      const gi = n0 + i;
      lo = Math.min(lo, s.lows[gi], s.bb.lower[gi] ?? Infinity);
      hi = Math.max(hi, s.highs[gi], s.bb.upper[gi] ?? -Infinity);
    }
    const range = hi - lo || 1;
    lo -= range * 0.05; hi += range * 0.05;

    const x = i => padL + (i - n0 + 0.5) * (W - padL - padR) / N;  // takes GLOBAL index
    const y = v => padT + (hi - v) / (hi - lo) * (plotB - padT);
    const slot = (W - padL - padR) / N;
    const bw = Math.max(Math.min(slot * 0.65, 9), 2);

    const up = cssVar('--up'), down = cssVar('--down');
    const s1 = cssVar('--series-1'), s2 = cssVar('--series-2');
    const accent = cssVar('--accent');
    const gridColor = cssVar('--grid'), mutedColor = cssVar('--muted'), inkColor = cssVar('--ink-2');

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" style="touch-action: pan-y">`;

    for (const tv of [lo + range * 0.08, (lo + hi) / 2, hi - range * 0.08]) {
      svg += `<line x1="${padL}" y1="${y(tv)}" x2="${W - padR}" y2="${y(tv)}" stroke="${gridColor}" stroke-width="1"/>`;
      svg += `<text x="${padL - 6}" y="${y(tv) + 3.5}" text-anchor="end" font-size="10" fill="${mutedColor}">$${tv.toFixed(2)}</text>`;
    }
    let lastMonth = -1;
    for (let i = 0; i < N; i++) {
      if (dates[i].getMonth() !== lastMonth) {
        lastMonth = dates[i].getMonth();
        if (i > 2 && i < N - 4)
          svg += `<text x="${x(n0 + i)}" y="${H - 5}" font-size="10" fill="${mutedColor}">${dates[i].toLocaleString('en-US', { month: 'short' })}</text>`;
      }
    }

    // Bollinger band wash + edges
    const bandTop = [], bandBot = [];
    for (let gi = n0; gi < n0 + N; gi++) {
      if (s.bb.upper[gi] != null) {
        bandTop.push([x(gi), y(s.bb.upper[gi])]);
        bandBot.push([x(gi), y(s.bb.lower[gi])]);
      }
    }
    if (bandTop.length > 1) {
      const p = pts => pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('');
      svg += `<path d="${p(bandTop)} ${bandBot.slice().reverse().map(q => 'L' + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('')} Z" fill="${accent}" opacity="0.06"/>`;
      svg += `<path d="${p(bandTop)}" fill="none" stroke="${mutedColor}" stroke-width="1" opacity="0.5"/>`;
      svg += `<path d="${p(bandBot)}" fill="none" stroke="${mutedColor}" stroke-width="1" opacity="0.5"/>`;
    }

    // SMA lines
    for (const [series, color] of [[s.sma20, s1], [s.sma50, s2]]) {
      const pts = [];
      for (let gi = n0; gi < n0 + N; gi++)
        if (series[gi] != null) pts.push([x(gi), y(series[gi])]);
      if (pts.length > 1)
        svg += `<path d="${pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
    }

    // volume strip
    let maxVol = 0;
    for (let gi = n0; gi < n0 + N; gi++) maxVol = Math.max(maxVol, s.volumes[gi]);
    for (let gi = n0; gi < n0 + N; gi++) {
      const vh = maxVol ? s.volumes[gi] / maxVol * volH : 0;
      const col = s.closes[gi] >= s.opens[gi] ? up : down;
      svg += `<rect x="${(x(gi) - bw / 2).toFixed(1)}" y="${(H - padB - vh).toFixed(1)}" width="${bw.toFixed(1)}" height="${vh.toFixed(1)}" fill="${col}" opacity="0.35"/>`;
    }

    // candles
    for (let gi = n0; gi < n0 + N; gi++) {
      const o = s.opens[gi], c = s.closes[gi], h = s.highs[gi], l = s.lows[gi];
      const col = c >= o ? up : down;
      const cx = x(gi);
      svg += `<line x1="${cx.toFixed(1)}" y1="${y(h).toFixed(1)}" x2="${cx.toFixed(1)}" y2="${y(l).toFixed(1)}" stroke="${col}" stroke-width="1"/>`;
      const top = y(Math.max(o, c)), bh = Math.max(Math.abs(y(o) - y(c)), 1);
      svg += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${col}" rx="1"/>`;
    }

    /* ---------- pattern-tool overlays ---------- */

    const clampI = p => p.i >= n0 && p.i < n0 + N;

    if (patternTools.levels) {
      for (const lvl of ov.levels) {
        if (lvl.level < lo || lvl.level > hi) continue;
        svg += `<line x1="${padL}" y1="${y(lvl.level).toFixed(1)}" x2="${W - padR}" y2="${y(lvl.level).toFixed(1)}" stroke="${accent}" stroke-width="1" opacity="0.55"/>`;
        svg += `<text x="${W - padR + 3}" y="${(y(lvl.level) + 3.5).toFixed(1)}" font-size="9" fill="${accent}">$${lvl.level.toFixed(0)} ×${lvl.touches}</text>`;
      }
    }

    if (patternTools.trendlines) {
      for (const [tl, col] of [[ov.trendHigh, down], [ov.trendLow, up]]) {
        if (!tl) continue;
        const yy1 = Math.max(padT, Math.min(plotB, y(tl.v1)));
        const yy2 = Math.max(padT, Math.min(plotB, y(tl.v2)));
        svg += `<line x1="${x(tl.i1).toFixed(1)}" y1="${yy1.toFixed(1)}" x2="${x(tl.i2).toFixed(1)}" y2="${yy2.toFixed(1)}" stroke="${col}" stroke-width="1.5" opacity="0.7"/>`;
      }
    }

    if (patternTools.swings) {
      for (const p of ov.pivotHighs.filter(clampI))
        svg += `<circle cx="${x(p.i).toFixed(1)}" cy="${(y(p.v) - 6).toFixed(1)}" r="3" fill="none" stroke="${down}" stroke-width="1.5"/>`;
      for (const p of ov.pivotLows.filter(clampI))
        svg += `<circle cx="${x(p.i).toFixed(1)}" cy="${(y(p.v) + 6).toFixed(1)}" r="3" fill="none" stroke="${up}" stroke-width="1.5"/>`;
    }

    if (patternTools.patterns) {
      for (const pat of ov.patterns) {
        const pts = pat.points.filter(clampI);
        if (!pts.length) continue;
        const col = pat.side === 'bull' ? up : down;
        // neckline
        if (pat.neckline >= lo && pat.neckline <= hi) {
          const x1 = x(Math.max(pat.points[0].i, n0)), x2 = W - padR;
          svg += `<line x1="${x1.toFixed(1)}" y1="${y(pat.neckline).toFixed(1)}" x2="${x2}" y2="${y(pat.neckline).toFixed(1)}" stroke="${col}" stroke-width="1.5" opacity="0.8"/>`;
          svg += `<text x="${x2 - 2}" y="${(y(pat.neckline) - 4).toFixed(1)}" text-anchor="end" font-size="9" fill="${inkColor}">neckline</text>`;
        }
        // anchor points + connecting path
        svg += `<path d="${pts.map((p, i2) => (i2 ? 'L' : 'M') + x(p.i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join('')}" fill="none" stroke="${col}" stroke-width="1.5" opacity="0.85"/>`;
        for (const p of pts) {
          svg += `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="5.5" fill="${cssVar('--surface')}"/>`;
          svg += `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3.5" fill="${col}"/>`;
        }
        const lp = pts[Math.floor(pts.length / 2)];
        svg += `<text x="${x(lp.i).toFixed(1)}" y="${(y(lp.v) + (pat.side === 'bull' ? 18 : -12)).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="600" fill="${inkColor}">${pat.name}</text>`;
      }
    }

    // per-candle pattern marks (and a map for the tooltip)
    const candleMarks = {};
    if (patternTools.candles) {
      for (let gi = Math.max(n0, 3); gi < n0 + N; gi++) {
        const found = Signals.candlesAt(s, gi);
        if (!found.length) continue;
        candleMarks[gi] = found;
        const bullish = found.some(f => f.side === 'bull');
        const bearish = found.some(f => f.side === 'bear');
        if (bullish)
          svg += `<text x="${x(gi).toFixed(1)}" y="${(y(s.lows[gi]) + 12).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="${up}">▲</text>`;
        if (bearish)
          svg += `<text x="${x(gi).toFixed(1)}" y="${(y(s.highs[gi]) - 5).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="${down}">▼</text>`;
        if (!bullish && !bearish)
          svg += `<text x="${x(gi).toFixed(1)}" y="${(y(s.highs[gi]) - 5).toFixed(1)}" text-anchor="middle" font-size="9" font-weight="700" fill="${mutedColor}">◆</text>`;
      }
    }

    svg += `<line id="xhair" x1="0" y1="${padT}" x2="0" y2="${H - padB}" stroke="${mutedColor}" stroke-width="1" opacity="0"/>`;
    svg += `</svg>`;

    // active pattern summary under the chart
    const activePats = patternTools.patterns && ov.patterns.length
      ? `<p class="pattern-note">Drawn on chart: ${ov.patterns.map(p => `${SIDE_GLYPH[p.side]} ${p.name} (neckline $${p.neckline.toFixed(2)})`).join(' · ')}</p>` : '';
    el.innerHTML = svg + `<div class="chart-tip" hidden></div>` + activePats;

    wireCrosshair(el, W, (sx, cy, rect, tip, xh) => {
      const i = Math.max(0, Math.min(N - 1, Math.floor((sx - padL) / slot)));
      const gi = n0 + i;
      xh.setAttribute('x1', x(gi)); xh.setAttribute('x2', x(gi)); xh.setAttribute('opacity', '0.5');
      const marks = candleMarks[gi];
      tip.innerHTML = `<small>${dates[i].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small> ` +
        `O ${s.opens[gi].toFixed(2)} · H ${s.highs[gi].toFixed(2)} · L ${s.lows[gi].toFixed(2)} · C ${s.closes[gi].toFixed(2)}` +
        `<br><small>vol ${(s.volumes[gi] / 1e6).toFixed(1)}M${marks ? ' · ' + marks.map(m => m.name).join(', ') : ''}</small>`;
      tip.hidden = false;
      tip.style.left = Math.max(70, Math.min(rect.width - 70, x(gi) / W * rect.width)) + 'px';
      tip.style.top = cy + 'px';
    });
  }

  /* Generic single-pane SVG chart with crosshair + tooltip. */
  function drawChart(el, opts) {
    const { series = [], guides = [], bars = null, height = 160, domain = null, fmt = v => v.toFixed(2) } = opts;
    const dates = MarketData.DATES.slice(-SHOW_BARS);
    const W = 520, H = height, padL = 56, padR = 10, padT = 8, padB = 20;

    const all = [];
    series.forEach(s => s.values.forEach(v => { if (v != null) all.push(v); }));
    if (bars) bars.values.forEach(v => { if (v != null) all.push(v); });
    guides.forEach(g => all.push(g.y));
    let lo = domain ? domain[0] : Math.min(...all);
    let hi = domain ? domain[1] : Math.max(...all);
    if (hi === lo) { hi += 1; lo -= 1; }
    const padRange = domain ? 0 : (hi - lo) * 0.06;
    lo -= padRange; hi += padRange;

    const n = SHOW_BARS;
    const x = i => padL + i * (W - padL - padR) / (n - 1);
    const y = v => padT + (hi - v) / (hi - lo) * (H - padT - padB);

    const gridColor = cssVar('--grid'), mutedColor = cssVar('--muted'), surface = cssVar('--surface');

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" style="touch-action: pan-y">`;

    const ticks = guides.length ? guides.map(g => g.y) : [lo + padRange, (lo + hi) / 2, hi - padRange];
    for (const tv of ticks) {
      svg += `<line x1="${padL}" y1="${y(tv)}" x2="${W - padR}" y2="${y(tv)}" stroke="${gridColor}" stroke-width="1"/>`;
      svg += `<text x="${padL - 6}" y="${y(tv) + 3.5}" text-anchor="end" font-size="10" fill="${mutedColor}" font-family="inherit">${guides.length ? guides.find(g => g.y === tv).label : fmt(tv)}</text>`;
    }

    let lastMonth = -1;
    for (let i = 0; i < n; i++) {
      const d = dates[i];
      if (d.getMonth() !== lastMonth) {
        lastMonth = d.getMonth();
        if (i > 3 && i < n - 6)
          svg += `<text x="${x(i)}" y="${H - 5}" font-size="10" fill="${mutedColor}">${d.toLocaleString('en-US', { month: 'short' })}</text>`;
      }
    }

    if (bars) {
      const zero = y(0);
      svg += `<line x1="${padL}" y1="${zero}" x2="${W - padR}" y2="${zero}" stroke="${cssVar('--hairline')}" stroke-width="1"/>`;
      const bw = Math.max((W - padL - padR) / n - 2, 1);
      bars.values.forEach((v, i) => {
        if (v == null) return;
        const yy = y(v);
        const top = Math.min(yy, zero), hh = Math.max(Math.abs(yy - zero), 0.5);
        svg += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" fill="${v >= 0 ? bars.posColor : bars.negColor}" opacity="0.75"/>`;
      });
    }

    for (const s of series) {
      const pts = [];
      s.values.forEach((v, i) => { if (v != null) pts.push([x(i), y(v)]); });
      if (!pts.length) continue;
      const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
      if (s.area) {
        svg += `<path d="${path} L ${pts[pts.length - 1][0].toFixed(1)} ${H - padB} L ${pts[0][0].toFixed(1)} ${H - padB} Z" fill="${s.color}" opacity="0.10"/>`;
      }
      svg += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2}" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (s.endDot) {
        const [ex, ey] = pts[pts.length - 1];
        svg += `<circle cx="${ex}" cy="${ey}" r="6" fill="${surface}"/><circle cx="${ex}" cy="${ey}" r="4" fill="${s.color}"/>`;
      }
    }

    svg += `<line id="xhair" x1="0" y1="${padT}" x2="0" y2="${H - padB}" stroke="${mutedColor}" stroke-width="1" opacity="0"/>`;
    svg += `</svg>`;
    el.innerHTML = svg + `<div class="chart-tip" hidden></div>`;

    wireCrosshair(el, W, (sx, cy, rect, tip, xh) => {
      const i = Math.max(0, Math.min(n - 1, Math.round((sx - padL) / ((W - padL - padR) / (n - 1)))));
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('opacity', '0.5');
      const parts = [`<small>${dates[i].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small>`];
      series.forEach(s => { if (s.values[i] != null) parts.push(`${s.label ? s.label + ' ' : ''}${fmt(s.values[i])}`); });
      if (bars && bars.values[i] != null) parts.push(`hist ${fmt(bars.values[i])}`);
      tip.innerHTML = parts.join(' · ');
      tip.hidden = false;
      tip.style.left = Math.max(70, Math.min(rect.width - 70, x(i) / W * rect.width)) + 'px';
      tip.style.top = cy + 'px';
    });
  }

  function signalsBlock(s) {
    const bull = s.sig.fired.filter(f => f.side === 'bull');
    const bear = s.sig.fired.filter(f => f.side === 'bear');
    const ctx  = s.sig.fired.filter(f => f.side === 'neutral');
    const item = f => `<div class="sig-item">
      <span class="side-badge side-${f.side}">${SIDE_GLYPH[f.side]}</span>
      <div><strong>${f.name}</strong><span class="sig-cat">${f.cat}</span>
      <span class="sig-note">${f.note}</span></div>
    </div>`;
    const col = (title, list) => list.length
      ? `<div><h3>${title}</h3>${list.map(item).join('')}</div>` : '';
    const { score } = s.sig;
    const verdict = score >= 3 ? `leaning bullish (+${score})` : score <= -3 ? `leaning bearish (${score})` : `mixed (${score >= 0 ? '+' : ''}${score})`;
    return `<h3>Detected signals — ${verdict}</h3>
      <div class="sig-cols">
        ${col(`Bullish (${bull.length})`, bull)}
        ${col(`Bearish (${bear.length})`, bear)}
      </div>
      ${ctx.length ? `<div style="margin-top:6px">${col(`Context (${ctx.length})`, ctx)}</div>` : ''}
      ${s.sig.fired.length === 0 ? '<p class="empty-note">No notable signals right now — sometimes "nothing happening" is the message.</p>' : ''}`;
  }

  function readout(s) {
    const notes = [];
    if (s.rsi > 70) notes.push(`<li><strong>RSI ${s.rsi.toFixed(0)} — overbought.</strong> The stock has climbed unusually fast. In strong uptrends this can persist, but chasing here is risky; patient investors often wait for a pullback.</li>`);
    else if (s.rsi < 30) notes.push(`<li><strong>RSI ${s.rsi.toFixed(0)} — oversold.</strong> Heavy recent selling. Sometimes a bounce setup, but check <em>why</em> it fell before assuming a bargain.</li>`);
    else notes.push(`<li><strong>RSI ${s.rsi.toFixed(0)} — neutral.</strong> Momentum is neither stretched up nor down.</li>`);

    if (s.cross?.type === 'bull') notes.push(`<li><strong>MACD bullish cross ${s.cross.barsAgo === 0 ? 'today' : s.cross.barsAgo + ' day(s) ago'}.</strong> Short-term momentum just turned up — a signal traders watch for entries, stronger when the overall trend is also up.</li>`);
    else if (s.cross?.type === 'bear') notes.push(`<li><strong>MACD bearish cross ${s.cross.barsAgo === 0 ? 'today' : s.cross.barsAgo + ' day(s) ago'}.</strong> Short-term momentum just turned down. Existing holders sometimes tighten stops here.</li>`);
    else if (s.macd > s.signal) notes.push(`<li><strong>MACD above signal.</strong> Upward momentum is intact.</li>`);
    else notes.push(`<li><strong>MACD below signal.</strong> Momentum is currently negative.</li>`);

    notes.push(s.uptrend
      ? `<li><strong>Trend: up.</strong> Price is above its 20-day average, which is above the 50-day — the classic healthy-uptrend alignment.</li>`
      : `<li><strong>Trend: not confirmed up.</strong> Price is below one of its key moving averages; momentum signals are less reliable against the trend.</li>`);

    notes.push(`<li><strong>${fmtPct(s.off52)} from its 52-week high.</strong> ${s.off52 > -5 ? 'Near highs — strength, but less margin for error.' : s.off52 < -20 ? 'Deep pullback territory — understand the story before buying the dip.' : 'A moderate pullback from the highs.'}</li>`);

    notes.push(`<li><strong>Remember:</strong> signals stack. One indicator alone is a whisper; several agreeing (see the detected-signals box above) is a conversation worth having. None of them are guarantees.</li>`);

    return `<h3>How to read this (${s.liveHistory ? 'real daily data' : 'demo data'})</h3><ul>${notes.join('')}</ul>`;
  }

  function renderDrawer(ticker) {
    const s = MarketData.BY_TICKER[ticker];
    if (!s) return;
    $('#drawer-ticker').textContent = s.t;
    $('#drawer-name').textContent = `${s.name} · ${s.sector} · ${s.liveHistory ? 'real daily candles' : s.liveQuote ? 'live quote, demo history' : 'demo data'}`;
    $('#drawer-price').textContent = fmtUsd(s.price);
    const chgEl = $('#drawer-chg');
    chgEl.textContent = `${arrow(s.chg)} ${fmtPct(Math.abs(s.chg), false)} today`;
    chgEl.className = s.chg >= 0 ? 'delta-up' : 'delta-down';

    const s1 = cssVar('--series-1'), s2 = cssVar('--series-2');
    const up = cssVar('--up'), down = cssVar('--down');

    syncToolChips();
    drawCandles($('#chart-price'), s);

    $('#drawer-signals').innerHTML = signalsBlock(s);

    drawChart($('#chart-rsi'), {
      series: [{ values: s.rsiSeries.slice(-SHOW_BARS), color: s2, width: 2 }],
      guides: [{ y: 70, label: '70' }, { y: 50, label: '50' }, { y: 30, label: '30' }],
      domain: [0, 100],
      height: 120,
      fmt: v => v.toFixed(0),
    });

    drawChart($('#chart-macd'), {
      series: [
        { values: s.macdSeries.macd.slice(-SHOW_BARS), color: s1, width: 2, label: 'MACD' },
        { values: s.macdSeries.signal.slice(-SHOW_BARS), color: s2, width: 2, label: 'sig' },
      ],
      bars: { values: s.macdSeries.histogram.slice(-SHOW_BARS), posColor: up, negColor: down },
      height: 140,
      fmt: v => v.toFixed(2),
    });

    drawChart($('#chart-stoch'), {
      series: [
        { values: s.stoch.k.slice(-SHOW_BARS), color: s1, width: 2, label: '%K' },
        { values: s.stoch.d.slice(-SHOW_BARS), color: s2, width: 2, label: '%D' },
      ],
      guides: [{ y: 80, label: '80' }, { y: 50, label: '50' }, { y: 20, label: '20' }],
      domain: [0, 100],
      height: 120,
      fmt: v => v.toFixed(0),
    });

    $('#drawer-read').innerHTML = readout(s);
  }

  function openDrawer(ticker) {
    const s = MarketData.BY_TICKER[ticker];
    if (!s) return;
    openTicker = ticker;
    renderDrawer(ticker);
    drawer.hidden = false;
    scrim.hidden = false;
    drawer.scrollTop = 0;
    // upgrade to real candles if a history provider is configured
    LiveData.ensureHistory(ticker, refreshed => {
      if (refreshed && openTicker === ticker) renderDrawer(ticker);
    });
  }

  /* ================= learn library ================= */

  const learnState = { side: '', search: '' };

  function renderLearn() {
    const q = learnState.search.toLowerCase();
    const examples = MarketData.signalExamples();
    let html = '';
    for (const cat of Signals.CATEGORIES) {
      const defs = Signals.DEFS.filter(d =>
        d.cat === cat &&
        (!learnState.side || d.side === learnState.side) &&
        (!q || d.name.toLowerCase().includes(q) || d.blurb.toLowerCase().includes(q)));
      if (!defs.length) continue;
      html += `<div class="learn-cat"><h3>${cat}</h3><div class="learn-grid">` +
        defs.map(d => {
          const fired = examples[d.id] || [];
          return `<div class="learn-card">
            <h4><span class="side-badge side-${d.side}">${SIDE_GLYPH[d.side]}</span>${d.name}</h4>
            <p>${d.blurb}</p>
            <div class="learn-fired">
              <span class="lf-label">${fired.length ? 'Firing now:' : 'Not firing on any stock right now'}</span>
              ${fired.slice(0, 6).map(t => `<button data-open="${t}">${t}</button>`).join('')}
              ${fired.length > 6 ? `<span class="lf-label">+${fired.length - 6} more</span>` : ''}
            </div>
          </div>`;
        }).join('') + `</div></div>`;
    }
    $('#learn-list').innerHTML = html || `<p class="empty-note">No signals match that search.</p>`;
  }

  $('#learn-side').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    learnState.side = chip.dataset.side;
    $$('#learn-side .chip').forEach(c => c.classList.toggle('is-active', c === chip));
    renderLearn();
  });
  $('#learn-search').addEventListener('input', e => { learnState.search = e.target.value.trim(); renderLearn(); });
  $('#learn-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-open]');
    if (btn) openDrawer(btn.dataset.open);
  });

  /* ================= portfolio ================= */

  function loadHoldings() {
    try {
      const raw = localStorage.getItem('pulse.holdings');
      if (raw) return JSON.parse(raw);
    } catch (_) { /* corrupted — start empty */ }
    return [];
  }
  let holdings = loadHoldings();          // manually-entered holdings
  let schwabHoldings = null;              // real positions once logged in
  const activeHoldings = () => schwabHoldings || holdings;
  const saveHoldings = () => localStorage.setItem('pulse.holdings', JSON.stringify(holdings));

  /* Pull real positions from Schwab and re-render when they change. */
  async function syncSchwab() {
    if (!Schwab.connected()) { if (schwabHoldings) { schwabHoldings = null; renderPortfolio(); } return; }
    const p = await Schwab.positions();
    if (p) {
      p.forEach(h => MarketData.ensureStock(h.t));
      schwabHoldings = p;
      renderPortfolio();
      renderConn();
    }
  }
  setInterval(syncSchwab, 60000);

  function renderPortfolio() {
    const hs = activeHoldings();
    const fromSchwab = !!schwabHoldings;
    let value = 0, cost = 0, dayChange = 0;
    const rows = hs.map(h => {
      const s = MarketData.BY_TICKER[h.t] || MarketData.ensureStock(h.t);
      const price = s ? s.price : (h.marketValue && h.shares ? h.marketValue / h.shares : h.cost);
      const v = s || !h.marketValue ? price * h.shares : h.marketValue;
      value += v;
      cost += h.cost * h.shares;
      if (s) dayChange += (s.price - s.closes[s.closes.length - 2]) * h.shares;
      const gain = v - h.cost * h.shares;
      const gainPct = h.cost > 0 ? (price / h.cost - 1) * 100 : 0;
      return `<tr>
        <td class="sym"><a href="#" data-open="${h.t}" style="color:inherit;text-decoration:none">${h.t}</a>${s ? '' : ' <span class="tag">no chart</span>'}</td>
        <td class="num">${h.shares}</td>
        <td class="num">${fmtUsd(h.cost)}</td>
        <td class="num">${fmtUsd(price)}</td>
        <td class="num">${fmtUsd(v)}</td>
        <td class="num ${gain >= 0 ? 'delta-up' : 'delta-down'}">${arrow(gain)} ${fmtUsd(Math.abs(gain))} (${fmtPct(Math.abs(gainPct), false)})</td>
        <td>${fromSchwab ? '' : `<button class="remove-btn" data-remove="${h.t}" title="Remove ${h.t}" aria-label="Remove ${h.t}">✕</button>`}</td>
      </tr>`;
    });
    $('#holdings-body').innerHTML = rows.join('') ||
      `<tr><td colspan="7" class="empty-note">${fromSchwab ? 'No equity positions found in your Schwab account.' : 'No holdings yet — add one below, or log in with Schwab (Connect) to sync your real portfolio.'}</td></tr>`;

    // Schwab-synced portfolios are read-only; manual entry hides
    $('#add-holding-form').style.display = fromSchwab ? 'none' : '';
    const sub = $('#view-portfolio .panel-sub');
    if (sub) sub.textContent = fromSchwab ? 'synced from your Schwab account' : 'saved in this browser';

    const totalGain = value - cost;
    $('#portfolio-stats').innerHTML = `
      <div class="stat"><div class="stat-label">Total value</div><div class="stat-value">${fmtUsd(value)}</div></div>
      <div class="stat"><div class="stat-label">Today</div>
        <div class="stat-value ${dayChange >= 0 ? 'delta-up' : 'delta-down'}" style="font-size:18px">${arrow(dayChange)} ${fmtUsd(Math.abs(dayChange))}</div></div>
      <div class="stat"><div class="stat-label">Total gain / loss</div>
        <div class="stat-value ${totalGain >= 0 ? 'delta-up' : 'delta-down'}" style="font-size:18px">${arrow(totalGain)} ${fmtUsd(Math.abs(totalGain))}</div>
        <div class="stat-delta">${cost > 0 ? fmtPct((value / cost - 1) * 100) + ' vs cost' : ''}</div></div>`;

    renderSuggestions(value);
    renderEvents();
  }

  /* ---- suggestion engine: plain-English observations per holding ---- */
  function renderSuggestions(totalValue) {
    const cards = [];
    const today = new Date();

    for (const h of activeHoldings()) {
      const s = MarketData.BY_TICKER[h.t];
      if (!s) continue;

      if (s.sig.score >= 4) {
        const tops = s.sig.fired.filter(f => f.side === 'bull').sort((a, b) => b.weight - a.weight).slice(0, 3);
        cards.push(card(s.t, 'Signals stacking bullish', 'tag-up',
          `${s.t} has ${s.sig.bull} bullish signals active right now — including ${tops.map(f => f.name.toLowerCase()).join(', ')}. The technical picture is leaning in your favor; the classic mistake here is selling a winner too early.`,
          'When independent signals (trend, momentum, volume, patterns) agree, each one corroborates the others. See the stock\'s detail view for the full list.'));
      } else if (s.sig.score <= -4) {
        const tops = s.sig.fired.filter(f => f.side === 'bear').sort((a, b) => b.weight - a.weight).slice(0, 3);
        cards.push(card(s.t, 'Signals stacking bearish', 'tag-down',
          `${s.t} has ${s.sig.bear} bearish signals active — including ${tops.map(f => f.name.toLowerCase()).join(', ')}. Worth reviewing your position size and your exit plan before the market makes the decision for you.`,
          'A pile-up of bearish signals doesn\'t force a sale, but it\'s the technical equivalent of several warning lights on at once. Decide your downside limit in advance.'));
      }

      const fired = Object.fromEntries(s.sig.fired.map(f => [f.id, f]));
      if (fired['golden-cross']) cards.push(card(s.t, 'Golden cross', 'tag-up',
        `${s.t} just formed a golden cross — its 50-day average crossed above the 200-day. Historically one of the most respected long-term bullish signals; long-term holders generally sit tight through these.`,
        'It means the intermediate trend has overtaken the long-term trend. It\'s slow, but that\'s the point: it filters out noise.'));
      if (fired['death-cross']) cards.push(card(s.t, 'Death cross', 'tag-down',
        `${s.t} just formed a death cross — its 50-day average dropped below the 200-day. The long-term trend has deteriorated; many investors reduce exposure or at least stop adding until it repairs.`,
        'The bearish mirror of the golden cross. Often late, but it marks a market that has already been weakening for months.'));
      if (fired['head-shoulders']) cards.push(card(s.t, 'Topping pattern', 'tag-down',
        `${s.t} is tracing a head-and-shoulders top (${fired['head-shoulders'].note}). If price breaks the neckline, textbook charting expects further downside. Know your exit level.`,
        'Three peaks with a lower final peak show buyers exhausting. It\'s only confirmed on a neckline break — but it\'s the most-watched top pattern for a reason.'));
      if (fired['double-top']) cards.push(card(s.t, 'Double top forming', 'tag-down',
        `${s.t} shows a double top (${fired['double-top'].note}). Two failures at the same ceiling is a caution flag for holders.`,
        'Buyers rejected the same price twice. Confirmation comes if price breaks below the dip between the two peaks.'));
      if (fired['double-bottom'] || fired['inv-head-shoulders']) {
        const f = fired['double-bottom'] || fired['inv-head-shoulders'];
        cards.push(card(s.t, 'Bottoming pattern', 'tag-up',
          `${s.t} shows a ${f.name.toLowerCase()} (${f.note}). Sellers are failing to push it lower — constructive if you've been underwater and patient.`,
          'Reversal patterns at lows mean supply is drying up. They confirm on a break above the pattern\'s neckline.'));
      }

      if (s.rsi > 70 && !fired['golden-cross']) cards.push(card(s.t, 'Running hot', 'tag-hot',
        `${s.t} has an RSI of ${s.rsi.toFixed(0)} — overbought territory. Momentum is strong, but a lot of good news is already in the price. Some investors trim a little here or at least avoid adding; nobody ever went broke taking partial profits.`,
        'RSI above 70 means the stock rose unusually fast over the last 14 days. It often precedes a pause or pullback, though strong stocks can stay overbought for a while.'));

      if (s.rsi < 30) cards.push(card(s.t, 'Oversold', 'tag-up',
        `${s.t} has an RSI of ${s.rsi.toFixed(0)} — oversold. If your original reason for owning it hasn't changed, panic-selling here is usually the worst option. Check the news before reacting.`,
        'RSI below 30 means heavy, fast selling. Bounces are common, but "oversold" can stay oversold if something is genuinely wrong at the company.'));

      if (s.cross?.type === 'bull') cards.push(card(s.t, 'Momentum turning up', 'tag-up',
        `${s.t} just printed a bullish MACD cross${s.uptrend ? ' while already in an uptrend — the stronger version of this signal' : ''}. Short-term momentum is shifting in your favor.`,
        'The MACD line crossing above its signal line suggests the short-term average is pulling ahead of the longer one — momentum turning positive.'));

      if (s.cross?.type === 'bear') cards.push(card(s.t, 'Momentum turning down', 'tag-down',
        `${s.t} just printed a bearish MACD cross. Not a sell signal by itself, but a good moment to review your position size and make sure you'd be comfortable holding through a dip.`,
        'The MACD line crossing below its signal line suggests fading momentum. Many investors use it as a "pay attention" flag rather than an automatic exit.'));

      if (!s.uptrend && s.off52 < -15 && s.rsi >= 30 && s.sig.score > -4) cards.push(card(s.t, 'Trend caution', 'tag-down',
        `${s.t} is ${fmtPct(s.off52, false).replace('-', '')} below its 52-week high and trading under its key moving averages. Have an exit plan: decide in advance how much downside you'll accept.`,
        'Price below the 20- and 50-day moving averages means the medium-term trend is down. Trends persist more often than they reverse.'));

      const weight = (s.price * h.shares) / totalValue * 100;
      if (totalValue > 0 && weight > 40) cards.push(card(s.t, 'Concentration risk', 'tag-hot',
        `${s.t} is ${weight.toFixed(0)}% of this portfolio. That's a lot riding on one stock — a single bad earnings report would hit hard. Consider diversifying gradually.`,
        'Most professionals keep single positions under 5–10%. Concentration amplifies both gains and losses; new investors usually underestimate the losses half.'));

      const ev = MarketData.EVENTS.find(ev2 => {
        const d = new Date(ev2.date + 'T12:00:00');
        const days = (d - today) / 86400000;
        return days >= 0 && days <= 30 && ev2.affects !== 'ALL' && ev2.affects.includes(s.t);
      });
      if (ev) cards.push(card(s.t, 'Event ahead', '',
        `${ev.title} is coming up on ${new Date(ev.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Expect bigger-than-usual moves in ${s.t} around that date — avoid placing market orders right at the announcement.`,
        'Scheduled events like earnings concentrate uncertainty into one moment. Options markets often "price in" the expected move; the surprise is what moves the stock.'));
    }

    const fed = MarketData.EVENTS.find(ev => {
      const days = (new Date(ev.date + 'T12:00:00') - today) / 86400000;
      return ev.kind === 'fed' && days >= 0;
    });
    if (fed && activeHoldings().length) cards.push(card('Portfolio', 'Fed meeting ahead', '',
      `The next Fed meeting is ${new Date(fed.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Rate decisions affect nearly every stock — growth names most of all. No action needed; just don't be surprised by a choppy day.`,
      'The FOMC sets interest rates. Higher rates make future profits worth less today, which weighs hardest on high-growth stocks.'));

    $('#suggestions').innerHTML = cards.length ? cards.join('') :
      `<p class="empty-note">Add holdings on the left to get tailored observations.</p>`;
  }

  function card(sym, tagText, tagClass, body, why) {
    return `<div class="sugg">
      <div class="sugg-head"><span class="sym">${sym}</span><span class="tag ${tagClass}">${tagText}</span></div>
      <p>${body}</p>
      <details><summary>Why?</summary><p>${why}</p></details>
    </div>`;
  }

  $('#holdings-body').addEventListener('click', e => {
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      holdings = holdings.filter(h => h.t !== rm.dataset.remove);
      saveHoldings();
      renderPortfolio();
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) { e.preventDefault(); openDrawer(open.dataset.open); }
  });

  $('#add-holding-form').addEventListener('submit', e => {
    e.preventDefault();
    const t = $('#add-ticker').value.trim().toUpperCase();
    const shares = parseFloat($('#add-shares').value);
    const cost = parseFloat($('#add-cost').value);
    if (!t || !(shares > 0) || !(cost > 0)) return;
    MarketData.ensureStock(t); // any US-listed symbol works, not just the S&P 500
    const existing = holdings.find(h => h.t === t);
    if (existing) {
      // merge: weighted average cost
      const totalShares = existing.shares + shares;
      existing.cost = +((existing.cost * existing.shares + cost * shares) / totalShares).toFixed(2);
      existing.shares = totalShares;
    } else {
      holdings.push({ t, shares, cost });
    }
    saveHoldings();
    e.target.reset();
    renderPortfolio();
  });

  /* ================= events ================= */

  function renderEvents() {
    const mineOnly = $('#events-mine-only').checked;
    const mySet = new Set(activeHoldings().map(h => h.t));
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const upcoming = MarketData.EVENTS
      .map(ev => ({ ...ev, d: new Date(ev.date + 'T12:00:00') }))
      .filter(ev => ev.d >= today)
      .filter(ev => !mineOnly || ev.affects === 'ALL' || ev.affects.some(t => mySet.has(t)));

    $('#events-list').innerHTML = upcoming.map(ev => {
      const days = Math.round((ev.d - today) / 86400000);
      const rel = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
      const kindLabel = { fed: 'Fed', econ: 'Economy', earnings: 'Earnings' }[ev.kind];
      const affected = ev.affects === 'ALL'
        ? `<span class="tag">Affects the whole market</span>`
        : ev.affects.map(t => `<span class="tag ${mySet.has(t) ? 'tag-hot' : ''}">${t}${mySet.has(t) ? ' · held' : ''}</span>`).join('');
      return `<div class="event">
        <div class="event-date">
          <div class="ed-day">${ev.d.getDate()}</div>
          <div class="ed-mon">${ev.d.toLocaleString('en-US', { month: 'short' })}</div>
          <div class="ed-rel">${rel}</div>
        </div>
        <div class="event-body">
          <h3>${ev.title} <span class="event-kind kind-${ev.kind}">${kindLabel}</span></h3>
          <p>${ev.desc}</p>
          <div class="event-holdings">${affected}</div>
        </div>
      </div>`;
    }).join('') || `<p class="empty-note">No upcoming events match this filter.</p>`;
  }

  $('#events-mine-only').addEventListener('change', renderEvents);

  /* ================= live data ================= */

  function renderBanner() {
    const st = LiveData.status();
    const el = $('#data-banner');
    if (!st.live) {
      el.textContent = st.restoredCount
        ? `Saved data — ${st.restoredCount} prices restored from your last session (as of ${new Date(st.restoredAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}). Add a key in "Connect" to go live again.`
        : 'Demo data — prices are simulated for learning. Open "Connect" to add a free API key for live S&P 500 quotes, or link thinkorswim.';
      return;
    }
    const age = st.lastAt ? Math.max(0, Math.round((Date.now() - st.lastAt) / 1000)) : null;
    el.innerHTML = `<span class="live-badge">LIVE</span> &nbsp;Quotes via ${st.provider} — ${st.updatedCount}/${MarketData.STOCKS.length} symbols refreshed${age != null ? `, last update ${age}s ago` : ''}${st.backoff ? ' (rate limit — pausing a minute)' : ''}${st.history ? ' · real candles load when you open a stock' : ''}.`;
  }
  setInterval(renderBanner, 5000);

  // coalesce live-quote table refreshes: at most one repaint every 4s
  let repaintQueued = false;
  function queueRepaint() {
    if (repaintQueued) return;
    repaintQueued = true;
    setTimeout(() => {
      repaintQueued = false;
      if ($('#view-screener').classList.contains('is-active')) renderScreener();
      if ($('#view-portfolio').classList.contains('is-active')) renderPortfolio();
    }, 4000);
  }

  LiveData.init({
    onUpdate: t => {
      renderBanner();
      queueRepaint();
      if (t && t === openTicker) renderDrawer(t);
    },
  });

  /* ================= connect modal ================= */

  const modalScrim = $('#modal-scrim');

  function renderConn() {
    const live = LiveData.status().live;
    const schwabOn = Schwab.connected();
    $('#conn-dot').classList.toggle('is-on', schwabOn || live);
    $('#conn-label').textContent = schwabOn ? 'Schwab linked' : live ? 'Live data on' : 'Connect';
    const st = $('#schwab-status');
    if (st) st.textContent = schwabOn
      ? '✓ Logged in — your portfolio tab shows your real Schwab positions.'
      : Schwab.error() ? 'Last attempt failed: ' + Schwab.error() : 'Not connected.';
    renderBanner();
  }

  /* Auto-fill API keys from the server using your saved sync code, so a new
     device (or the installed iPhone app) goes live without retyping keys. */
  async function autoConfig() {
    const code = localStorage.getItem('pulse.synccode');
    if (!code) return;
    const lk = LiveData.getKeys();
    if (lk.finnhub || lk.twelvedata) return; // already configured on this device
    try {
      const r = await fetch('api/config', { headers: { 'x-pulse-code': code } });
      if (!r.ok) return;
      const j = await r.json();
      if (j.finnhub || j.twelvedata) { LiveData.setKeys(j); renderConn(); }
    } catch (_) { /* offline or not deployed with functions — demo continues */ }
  }

  $('#connect-btn').addEventListener('click', () => {
    const lk = LiveData.getKeys();
    $('#finnhub-key').value = lk.finnhub || '';
    $('#twelvedata-key').value = lk.twelvedata || '';
    $('#sync-code').value = localStorage.getItem('pulse.synccode') || '';
    renderConn();
    modalScrim.hidden = false;
  });
  $('#modal-close').addEventListener('click', () => { modalScrim.hidden = true; });
  modalScrim.addEventListener('click', e => { if (e.target === modalScrim) modalScrim.hidden = true; });

  $('#live-save').addEventListener('click', async () => {
    const code = $('#sync-code').value.trim();
    if (code) localStorage.setItem('pulse.synccode', code);
    LiveData.setKeys({ finnhub: $('#finnhub-key').value, twelvedata: $('#twelvedata-key').value });
    await autoConfig();
    renderConn();
    modalScrim.hidden = true;
  });
  $('#live-clear').addEventListener('click', () => {
    LiveData.setKeys({ finnhub: '', twelvedata: '' });
    localStorage.removeItem('pulse.synccode');
    $('#finnhub-key').value = '';
    $('#twelvedata-key').value = '';
    $('#sync-code').value = '';
    renderConn();
  });

  $('#schwab-login').addEventListener('click', () => { location.href = 'api/schwab/login'; });

  $('#schwab-disconnect').addEventListener('click', () => {
    Schwab.disconnect();
    schwabHoldings = null;
    renderPortfolio();
    renderConn();
    modalScrim.hidden = true;
  });

  /* ================= boot ================= */

  Schwab.absorbCallback();  // pick up tokens if we just came back from Schwab login
  autoConfig();             // auto-fill saved API keys from the server
  syncSchwab();             // pull real positions if logged in

  // reflect the restored screen settings in the controls
  $$('#presets .chip').forEach(c => c.classList.toggle('is-active', c.dataset.preset === state.preset));
  $('#sector-filter').value = state.sector;
  $('#signal-filter').value = state.signal;

  renderScreener();
  renderPortfolio();
  renderLearn();
  renderConn();
  renderBanner();

  // PWA: offline app-shell cache so "Add to Home Screen" works like a native app
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline install is optional */ });
  }
})();
