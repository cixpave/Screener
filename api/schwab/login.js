/* Starts the Schwab OAuth login. Redirects to Schwab's official sign-in
   page; your Schwab password is only ever typed on schwab.com.

   Vercel env vars used: SCHWAB_APP_KEY, and optionally SCHWAB_REDIRECT_URI.

   The callback URL registered in your Schwab developer app must byte-for-byte
   equal the redirect_uri sent here. By default that is derived from the host
   serving this request, so opening the app on a preview or alternate Vercel
   domain sends a redirect_uri Schwab does not recognise and the login never
   returns. Set SCHWAB_REDIRECT_URI to the one canonical, registered URL to
   pin it regardless of which domain the app was loaded from. */

export default function handler(req, res) {
  const appKey = process.env.SCHWAB_APP_KEY;
  if (!appKey) {
    res.status(501).send('Not configured: set SCHWAB_APP_KEY and SCHWAB_SECRET in Vercel project env vars.');
    return;
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const redirectUri = process.env.SCHWAB_REDIRECT_URI ||
    `https://${host}/api/schwab/callback`;
  const url = 'https://api.schwabapi.com/v1/oauth/authorize' +
    `?response_type=code&client_id=${encodeURIComponent(appKey)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.writeHead(302, { Location: url });
  res.end();
}
