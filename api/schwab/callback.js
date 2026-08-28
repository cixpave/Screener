/* Schwab OAuth callback: exchanges the one-time code for tokens using the
   app secret (server-side only — the secret never reaches the browser),
   then hands the tokens to the app in the URL fragment (fragments are not
   sent to servers or logged).

   Vercel env vars used: SCHWAB_APP_KEY, SCHWAB_SECRET. */

export default async function handler(req, res) {
  const appKey = process.env.SCHWAB_APP_KEY;
  const secret = process.env.SCHWAB_SECRET;
  const { code, error } = req.query;
  if (error) { res.writeHead(302, { Location: `/#schwab_error=${encodeURIComponent(error)}` }); res.end(); return; }
  if (!appKey || !secret || !code) { res.status(400).send('Missing configuration or code.'); return; }

  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = `https://${host}/api/schwab/callback`;

  try {
    const r = await fetch('https://api.schwabapi.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${appKey}:${secret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.access_token) {
      res.writeHead(302, { Location: `/#schwab_error=${encodeURIComponent(j.error_description || j.error || 'token exchange failed')}` });
      res.end();
      return;
    }
    const payload = Buffer.from(JSON.stringify({
      access: j.access_token,
      refresh: j.refresh_token,
      exp: Date.now() + (j.expires_in || 1800) * 1000,
    })).toString('base64url');
    res.writeHead(302, { Location: `/#schwab=${payload}` });
    res.end();
  } catch (e) {
    res.writeHead(302, { Location: `/#schwab_error=${encodeURIComponent('network error during token exchange')}` });
    res.end();
  }
}
