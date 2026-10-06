// Gemini proxy for the AI panel. Accepts the same body as /api/claude ({ system, messages, max_tokens })
// and answers in the same shape ({ content: [{ text }] }) so the front end can swap providers.
//
// Keys: every Vercel env var named like Gemini_Api_Key, Gemini_api_key2, GEMINI_API_KEY_3 ... is used, in name order.
// If one key is out of quota or rejected, the request falls over to the next one, and the bad key is skipped for a while.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const KEY_NAME = /^gemini_api_key[_-]?\d*$/i;
const cooldown = new Map(); // env var name -> timestamp until which it is skipped

function listKeys() {
  return Object.keys(process.env)
    .filter((n) => KEY_NAME.test(n) && process.env[n])
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((name) => ({ name, key: process.env[name] }));
}

// 429 / quota: this key is spent (or rate limited). 401/403 or "key not valid": this key is dead.
// 503 and other "busy" errors are model-side, so another key would not help; the app retries those with backoff.
function keyProblem(status, err) {
  if (status === 429 || err?.status === 'RESOURCE_EXHAUSTED') return 10 * 60 * 1000;
  if ([401, 403].includes(status) || /api key not valid|api_key_invalid|permission denied/i.test(err?.message || '')) return 60 * 60 * 1000;
  return 0;
}

export default async function handler(req, res) {
  // Browsers on these origins may call this route. Add more with the ALLOWED_ORIGINS env var (comma-separated).
  const allowedOrigins = [
    'https://adityasanghavi-sys.github.io',
    'https://snackible-ops-dashboard.vercel.app',
    'https://snackible-ops-dashboard-new.vercel.app',
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean),
  ];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const keys = listKeys();
  if (!keys.length) return res.status(500).json({ error: 'No Gemini key is set on the server. Add Gemini_Api_Key in Vercel and redeploy.' });

  const { messages = [], system, max_tokens, json } = req.body || {};
  const body = {
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content ?? '') }] })),
    generationConfig: {
      maxOutputTokens: Math.max(max_tokens || 1000, 4096),
      temperature: 0.4,
      ...(json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  // Healthy keys first; if every key is cooling down, try them all anyway rather than failing outright.
  const now = Date.now();
  const ready = keys.filter((k) => (cooldown.get(k.name) || 0) <= now);
  const order = ready.length ? ready : keys;

  let last = { status: 502, message: 'Gemini API error' };
  try {
    for (const { name, key } of order) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok && !data.error) {
        const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        if (!text) return res.status(502).json({ error: data.promptFeedback?.blockReason ? `Blocked by Gemini: ${data.promptFeedback.blockReason}` : 'Gemini returned an empty reply.' });
        return res.status(200).json({ content: [{ type: 'text', text }] });
      }

      console.error(`Gemini error on ${name}:`, JSON.stringify(data.error || data));
      last = { status: response.status, message: data.error?.message || 'Gemini API error' };
      const skipFor = keyProblem(response.status, data.error);
      if (!skipFor) break; // not a key problem, so a different key will not help
      cooldown.set(name, Date.now() + skipFor);
    }
    // Pass busy/rate-limit statuses through so the app knows to retry; everything else is a hard failure.
    const status = [429, 503, 504].includes(last.status) ? last.status : 502;
    return res.status(status).json({ error: last.message });
  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
