export default async function handler(req, res) {
  const allowedOrigins = ['https://adityasanghavi-sys.github.io', 'https://snackible-ops-dashboard.vercel.app'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { messages, system, max_tokens } = req.body;

  // Combine system prompt into first user message instead of injecting fake turns
  const geminiMessages = messages.map((m, i) => {
    let text = m.content;
    if (i === 0 && system) text = system + '\n\n' + text;
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }]
    };
  });

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: geminiMessages,
        generationConfig: { maxOutputTokens: max_tokens || 1000, temperature: 0.7 }
      })
    }
  );

  const data = await response.json();
  console.log('Gemini status:', response.status, JSON.stringify(data).substring(0, 300));
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  res.status(200).json({ content: [{ type: 'text', text }] });
}
