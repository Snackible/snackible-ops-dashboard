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

  // Key from any of CLAUDE_API, CLAUDE_API_KEY or ANTHROPIC_API_KEY (case-insensitive), in that order.
  const names = Object.keys(process.env).filter((n) => /^(claude_api(_key)?|anthropic_api_key)$/i.test(n) && process.env[n]);
  names.sort((a, b) => /claude/i.test(b) - /claude/i.test(a));
  const apiKey = names.length ? process.env[names[0]] : '';
  if (!apiKey) return res.status(500).json({ error: 'No Claude API key set. Add CLAUDE_API in Vercel and redeploy.' });

  try {
    // 1. We extract the model name sent by the frontend
    const { messages, system, max_tokens, model } = req.body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", // <-- HARDCODED: ignores frontend cache
        max_tokens: max_tokens || 1000,
        system: system || '',
        messages: messages
      })
    });

    const data = await response.json();
    console.log('Claude status:', response.status);

    if (data.error) {
      console.error('Claude error:', JSON.stringify(data.error));
      return res.status(502).json({ error: data.error.message || 'Claude API error' });
    }

    return res.status(200).json(data);

  } catch (err) {
    console.error('Handler error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
