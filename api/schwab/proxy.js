/* CORS proxy for Schwab API reads. The Schwab API rejects browser
   cross-origin calls, so the app routes GETs through this function. Only
   whitelisted read-only paths are allowed; the caller's own bearer token is
   forwarded, so this proxy grants no access by itself. */

const ALLOWED = [/^trader\/v1\/accounts/, /^marketdata\/v1\//];

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
  const path = req.query.path || '';
  if (!ALLOWED.some(rx => rx.test(path)) || path.includes('..')) {
    res.status(400).json({ error: 'path not allowed' });
    return;
  }
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) { res.status(401).json({ error: 'missing bearer token' }); return; }

  try {
    const qs = { ...req.query };
    delete qs.path;
    const url = `https://api.schwabapi.com/${path}${Object.keys(qs).length ? '?' + new URLSearchParams(qs) : ''}`;
    const r = await fetch(url, { headers: { Authorization: auth, Accept: 'application/json' } });
    const body = await r.text();
    res.setHeader('Cache-Control', 'no-store');
    res.status(r.status).send(body);
  } catch (e) {
    res.status(502).json({ error: 'upstream error' });
  }
}
