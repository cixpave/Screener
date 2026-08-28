/* Refreshes a Schwab access token (they expire after ~30 minutes). The
   browser sends its refresh token; the app secret stays server-side. */

export default async function handler(req, res) {
  const appKey = process.env.SCHWAB_APP_KEY;
  const secret = process.env.SCHWAB_SECRET;
  if (!appKey || !secret) { res.status(501).json({ error: 'Schwab not configured.' }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const refresh = (req.body && req.body.refresh_token) || '';
  if (!refresh) { res.status(400).json({ error: 'missing refresh_token' }); return; }

  try {
    const r = await fetch('https://api.schwabapi.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${appKey}:${secret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) { res.status(401).json({ error: j.error_description || j.error || 'refresh failed' }); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      access: j.access_token,
      refresh: j.refresh_token || refresh,
      exp: Date.now() + (j.expires_in || 1800) * 1000,
    });
  } catch (e) {
    res.status(502).json({ error: 'network error during refresh' });
  }
}
