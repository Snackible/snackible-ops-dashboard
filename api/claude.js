export default async function handler(req, res) {
  const allowedOrigins = ['https://adityasanghavi-sys.github.io', 'https://snackible-ops-dashboard.vercel.app'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, system, max_tokens } = req.body;

    // Build single prompt string — most reliable approach
    let fullPrompt = '';
    if (system) fullPrompt += system + '\n\n';
    messages.forEach(m => {
      fullPrompt += (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content + '\n\n';
    });
    fullPrompt += 'Assistant:';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.Gemini_api}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
          generationConfig: { maxOutputTokens: max_tokens || 1000, temperature: 0.7 }
        })
      }
    );

    const data = await response.json();
    console.log('Gemini status:', response.status, JSON.stringify(data).substring(0, 400));
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.status(200).json({ content: [{ type: 'text', text }] });

  } catch (err) {
    console.error('Handler error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
