// Gemini proxy for the AI panel. Accepts the same body as /api/claude ({ system, messages, max_tokens })
// and answers in the same shape ({ content: [{ text }] }) so the front end can swap providers.
// Reads the key from the Vercel env var "Gemini_Api_Key" (GEMINI_API_KEY / GOOGLE_API_KEY also work).
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';

export default async function handler(req, res) {
  const allowedOrigins = ['https://adityasanghavi-sys.github.io', 'https://snackible-ops-dashboard.vercel.app'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.Gemini_Api_Key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Gemini_Api_Key is not set on the server. Add it in Vercel and redeploy.' });

  try {
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

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || data.error) {
      console.error('Gemini error:', JSON.stringify(data.error || data));
      return res.status(502).json({ error: data.error?.message || 'Gemini API error' });
    }
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    if (!text) return res.status(502).json({ error: data.promptFeedback?.blockReason ? `Blocked by Gemini: ${data.promptFeedback.blockReason}` : 'Gemini returned an empty reply.' });
    return res.status(200).json({ content: [{ type: 'text', text }] });
  } catch (err) {
    console.error('Handler error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
