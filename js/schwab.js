/* Schwab (thinkorswim) client: handles the OAuth tokens handed back by
   /api/schwab/callback, keeps them fresh, and pulls your real positions.
   Tokens live only in this browser; the app secret never leaves the server. */

const Schwab = (() => {
  const LS_TOK = 'pulse.schwabtok';

  let tok = null;
  try { tok = JSON.parse(localStorage.getItem(LS_TOK) || 'null'); } catch (_) {}

  let positionsCache = null;
  let positionsAt = 0;
  let lastError = null;

  const save = () => {
    if (tok) localStorage.setItem(LS_TOK, JSON.stringify(tok));
    else localStorage.removeItem(LS_TOK);
  };

  /* Pick up tokens (or an error) delivered in the URL fragment after the
     OAuth redirect. Returns true if a login just completed. */
  function absorbCallback() {
    const h = location.hash || '';
    if (h.startsWith('#schwab=')) {
      try {
        tok = JSON.parse(atob(h.slice(8).replace(/-/g, '+').replace(/_/g, '/')));
        save();
        lastError = null;
      } catch (_) { lastError = 'could not read login response'; }
      history.replaceState(null, '', location.pathname + location.search);
      return !!tok;
    }
    if (h.startsWith('#schwab_error=')) {
      lastError = decodeURIComponent(h.slice(14));
      history.replaceState(null, '', location.pathname + location.search);
    }
    return false;
  }

  const connected = () => !!(tok && tok.refresh);

  async function freshAccess() {
    if (!tok) return null;
    if (tok.access && Date.now() < tok.exp - 60000) return tok.access;
    try {
      const r = await fetch('api/schwab/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: tok.refresh }),
      });
      if (!r.ok) { if (r.status === 401) { tok = null; save(); } return null; }
      tok = await r.json();
      save();
      return tok.access;
    } catch (_) { return null; }
  }

  /* Your real holdings: equity/ETF positions across all Schwab accounts,
     mapped to the app's holding shape. Cached for a minute. */
  async function positions(force = false) {
    if (!connected()) return null;
    if (!force && positionsCache && Date.now() - positionsAt < 60000) return positionsCache;
    const access = await freshAccess();
    if (!access) return positionsCache;
    try {
      const r = await fetch('api/schwab/proxy?path=' + encodeURIComponent('trader/v1/accounts') + '&fields=positions', {
        headers: { Authorization: 'Bearer ' + access },
      });
      if (!r.ok) { lastError = 'Schwab returned ' + r.status; return positionsCache; }
      const accounts = await r.json();
      const merged = {};
      for (const a of accounts || []) {
        for (const p of a.securitiesAccount?.positions || []) {
          const sym = p.instrument?.symbol;
          const qty = (p.longQuantity || 0) - (p.shortQuantity || 0);
          const type = p.instrument?.assetType;
          if (!sym || !qty || (type !== 'EQUITY' && type !== 'ETF' && type !== 'COLLECTIVE_INVESTMENT')) continue;
          if (!merged[sym]) merged[sym] = { t: sym, shares: 0, costTotal: 0, marketValue: 0 };
          merged[sym].shares += qty;
          merged[sym].costTotal += (p.averagePrice || 0) * qty;
          merged[sym].marketValue += p.marketValue || 0;
        }
      }
      positionsCache = Object.values(merged).map(m => ({
        t: m.t,
        shares: +m.shares.toFixed(4),
        cost: m.shares ? +(m.costTotal / m.shares).toFixed(2) : 0,
        marketValue: m.marketValue,
        fromSchwab: true,
      }));
      positionsAt = Date.now();
      lastError = null;
      return positionsCache;
    } catch (_) { return positionsCache; }
  }

  function disconnect() {
    tok = null;
    positionsCache = null;
    save();
  }

  return {
    absorbCallback, connected, positions, disconnect,
    error: () => lastError,
  };
})();
