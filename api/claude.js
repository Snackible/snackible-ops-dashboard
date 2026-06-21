export default async function handler(req, res) {
  const allowedOrigins = ['https://adityasanghavi-sys.github.io', 'https://snackible-ops-dashboard.vercel.app'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

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
        // 2. Use the frontend model, or fallback to the correct real model
        model: model || 'claude-3-5-sonnet-20240620',
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
