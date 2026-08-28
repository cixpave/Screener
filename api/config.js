/* Returns your market-data API keys so devices auto-configure without
   retyping them. Guarded by a sync code (PULSE_CODE env var) so the public
   URL doesn't leak your keys.

   Vercel env vars used: PULSE_CODE, FINNHUB_KEY, TWELVEDATA_KEY. */

export default function handler(req, res) {
  const code = process.env.PULSE_CODE;
  if (!code) {
    res.status(501).json({ error: 'Not configured: set PULSE_CODE (and FINNHUB_KEY / TWELVEDATA_KEY) in Vercel project env vars.' });
    return;
  }
  if ((req.headers['x-pulse-code'] || '') !== code) {
    res.status(401).json({ error: 'Wrong or missing sync code.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({
    finnhub: process.env.FINNHUB_KEY || '',
    twelvedata: process.env.TWELVEDATA_KEY || '',
    schwab: !!(process.env.SCHWAB_APP_KEY && process.env.SCHWAB_SECRET),
  });
}
