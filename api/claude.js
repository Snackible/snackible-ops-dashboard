export default async function handler(req, res) {
  const allowedOrigins = ['https://adityasanghavi-sys.github.io', 'https://snackible-ops-dashboard.vercel.app'];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { messages, system, max_tokens } = req.body;

  // Convert Anthropic format to Gemini format
  const geminiMessages = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));

  // Prepend system prompt as first user message if present
  if (system) {
    geminiMessages.unshift({ role: 'user', parts: [{ text: system }] });
    geminiMessages.splice(1, 0, { role: 'model', parts: [{ text: 'Understood.' }] });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: geminiMessages,
        generationConfig: { maxOutputTokens: max_tokens || 1000 }
      })
    }
  );

  const data = await response.json();

  // Convert Gemini response back to Anthropic format so frontend needs no changes
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  res.status(200).json({
    content: [{ type: 'text', text }]
  });
}
