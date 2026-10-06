import { useEffect, useRef, useState } from 'react';
import { Card, Banner, Segmented } from '../components/ui.jsx';
import { askAi, getSessionGeminiKey, setSessionGeminiKey } from '../lib/api.js';
import { fmtL, fmtN } from '../lib/format.js';

const SYSTEM =
  'You are a sharp ops analyst for Snackible, an Indian D2C millet snack brand. You analyze ops data and give concise, actionable commentary. Always be specific, use numbers. No filler. Keep bullets to 1-2 lines max.';
const SECTIONS = [
  ['performance', 'Performance'], ['anomalies', 'Anomalies'], ['recommendations', 'Recommendations'],
  ['channels', 'Channels'], ['states', 'States'], ['skus', 'SKUs'],
];
const SUGGESTIONS = ['Which channel needs urgent attention?', 'Why might RTO be high?', "What's dragging down fill rate?", 'Which state should we prioritise?'];

function buildPrompt({ d, prev, label }) {
  const lines = (obj, f) => Object.entries(obj || {}).map(f).join('\n');
  const fillByChannel = lines(d.channel_fill, ([ch, v]) => (v.po > 0 ? `${ch}: PO=${fmtN(v.po)}, Invoiced=${fmtN(v.inv)}, Fill=${(v.rate * 100).toFixed(1)}%` : '')).replace(/\n+/g, '\n');
  const topStates = Object.entries(d.locations || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s, v]) => `${s}: ${fmtL(v)}`).join(', ');
  const stateFill = Object.entries(d.state_fill || {}).filter(([, v]) => v.po > 0).map(([s, v]) => `${s}: ${((v.inv / v.po) * 100).toFixed(1)}%`).join(', ');
  const couriers = lines(d.couriers, ([n, c]) => `${n}: ${c.orders} orders, TAT=${c.avg_total_tat ?? c.avg_tat}d`);
  const top = Object.entries(d.skus || {}).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const skus = top.map(([n, q]) => `${n}: ${fmtN(q)} units${prev?.skus?.[n] ? ` (prior ${fmtN(prev.skus[n])})` : ''}`).join(', ');
  const wow = prev?.gmv > 0 ? (((d.gmv - prev.gmv) / prev.gmv) * 100).toFixed(1) + '%' : 'N/A';
  return `Analyze this period's data for Snackible Operations.

PERIOD: ${label}
GMV: ${fmtL(d.gmv)} (change vs prior: ${wow})
Orders: ${d.orders} | Fill: ${d.avg_fill}% | RTO: ${d.rto_pct}%
TAT: total ${d.avg_total_tat}d (PO→dispatch ${d.avg_proc_tat}d, dispatch→delivery ${d.avg_tran_tat}d)
DN/discrepancy value: ${fmtL(d.dn_value)}

CHANNEL FILL:
${fillByChannel}

TOP STATES BY GMV: ${topStates}
STATE FILL: ${stateFill}
STATUSES: ${Object.entries(d.statuses || {}).map(([k, v]) => `${k}=${v}`).join(', ')}

COURIERS:
${couriers}

TOP 5 SKUs: ${skus}
PRIOR PERIOD: ${prev ? `GMV ${fmtL(prev.gmv)}, fill ${prev.avg_fill}%, orders ${prev.orders}` : 'none'}

Respond ONLY with one JSON object (no markdown, no backticks). Each of these keys holds an array of 2-4 short strings, one bullet each, under 25 words, no line breaks inside a string:
performance, anomalies, recommendations (exactly 3, ranked), channels, states, skus (movement in top SKUs vs prior period).
Keep the whole reply compact.`;
}

// Models sometimes wrap JSON in fences, add stray text, or get cut off mid-reply. Recover whatever sections we can.
function parseInsights(text) {
  const clean = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try { return JSON.parse(clean.slice(s, e + 1)); } catch { /* fall through to per-key recovery */ }
  }
  const out = {};
  const at = SECTIONS.map(([k]) => [k, clean.indexOf(`"${k}"`)]).filter(([, i]) => i >= 0).sort((a, b) => a[1] - b[1]);
  at.forEach(([k, i], n) => {
    const seg = clean.slice(i + k.length + 2, n + 1 < at.length ? at[n + 1][1] : undefined);
    const items = [...seg.matchAll(/"((?:[^"\\]|\\.)+)"/g)].map((m) => m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'));
    if (items.length) out[k] = items;
  });
  return Object.keys(out).length ? out : { performance: clean };
}

const bullets = (v) => {
  const items = (Array.isArray(v) ? v : [v || '']).flatMap((x) => String(x).split(/•|\n/));
  const out = items.map((t) => String(t).replace(/^\s*[•\-–]\s*/, '').trim()).filter(Boolean);
  return out.length ? out : ['—'];
};

const loadProvider = () => {
  try { return localStorage.getItem('ai-provider') === 'gemini' ? 'gemini' : 'claude'; } catch { return 'claude'; }
};

export default function AiInsights({ ctx }) {
  const [provider, setProvider] = useState(loadProvider);
  const [hasKey, setHasKey] = useState(() => !!getSessionGeminiKey());
  const [keyInput, setKeyInput] = useState('');
  const saveKey = (e) => { e.preventDefault(); setSessionGeminiKey(keyInput); setKeyInput(''); setHasKey(!!keyInput.trim()); };
  const clearKey = () => { setSessionGeminiKey(''); setHasKey(false); };
  const pickProvider = (p) => {
    setProvider(p);
    try { localStorage.setItem('ai-provider', p); } catch { /* storage unavailable */ }
  };
  const [state, setState] = useState({ status: 'idle', result: null, error: '' });
  const [chat, setChat] = useState([]); // visible messages
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useRef([]);
  const abort = useRef(null);
  const [wait, setWait] = useState(null); // { attempt, retries, until } while backing off
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!wait) return undefined;
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, [wait]);
  const cancel = () => abort.current?.abort();
  const endRef = useRef(null);

  // A different period invalidates earlier insights.
  useEffect(() => { setState({ status: 'idle', result: null, error: '' }); setChat([]); history.current = []; }, [ctx.period, ctx.mode, provider]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [chat]);

  async function generate() {
    setState({ status: 'loading', result: null, error: '' });
    const prompt = buildPrompt(ctx);
    abort.current = new AbortController();
    try {
      const text = await askAi({ onWait: setWait, signal: abort.current.signal, provider, json: true, system: SYSTEM, max_tokens: 2500, messages: [{ role: 'user', content: prompt }] });
      const result = parseInsights(text);
      history.current = [{ role: 'user', content: `Current ops data context:\n${prompt}` }, { role: 'assistant', content: text }];
      setState({ status: 'ready', result, error: '' });
    } catch (e) {
      setState(e.name === 'AbortError' ? { status: 'idle', result: null, error: '' } : { status: 'error', result: null, error: e.message });
    }
    setWait(null);
  }

  async function send(q) {
    const text = (q ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setChat((c) => [...c, { role: 'user', text }]);
    history.current.push({ role: 'user', content: text });
    try {
      abort.current = new AbortController();
      const reply = await askAi({
        provider, onWait: setWait, signal: abort.current.signal,
        system: 'You are a sharp ops analyst for Snackible. Answer questions about the ops data concisely. Use numbers from the data. Max 3-4 sentences. No filler.',
        messages: history.current,
      });
      history.current.push({ role: 'assistant', content: reply });
      setChat((c) => [...c, { role: 'assistant', text: reply }]);
    } catch (e) {
      history.current.pop();
      if (e.name !== 'AbortError') setChat((c) => [...c, { role: 'assistant', text: `Couldn't get an answer: ${e.message}`, error: true }]);
    }
    setWait(null);
    setBusy(false);
  }

  return (
    <Card
      title="AI analysis"
      sub={`Commentary on ${ctx.label}`}
      actions={
        <div className="controls">
          <Segmented label="AI model" value={provider} onChange={pickProvider} options={[['claude', 'Claude'], ['gemini', 'Gemini']]} />
          <button className="btn" onClick={generate} disabled={state.status === 'loading'}>{state.status === 'loading' ? 'Analysing…' : state.result ? 'Regenerate' : 'Generate insights'}</button>
        </div>
      }
    >
      {provider === 'gemini' && (
        <form onSubmit={saveKey} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          {hasKey ? (
            <>
              <span className="badge good">Using your Gemini key for this session</span>
              <button type="button" className="link-btn" onClick={clearKey}>Remove key</button>
            </>
          ) : (
            <>
              <input className="field" type="password" autoComplete="off" spellCheck={false} style={{ flex: '1 1 260px', maxWidth: 380 }} value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="Paste a Gemini API key (optional, this session only)" aria-label="Gemini API key" />
              <button className="btn" disabled={!keyInput.trim()}>Use key</button>
              <span className="c-faint" style={{ fontSize: 12 }}>Kept in this tab only. Without one, the server key is used.</span>
            </>
          )}
        </form>
      )}
      {state.status === 'idle' && <p className="c-muted" style={{ maxWidth: '60ch' }}>Generate a written read on this period: what moved, what looks off, and what to do first. You can ask follow-up questions afterwards.</p>}
      {wait && (
        <Banner tone="warn" title={`${provider === 'gemini' ? 'Gemini' : 'Claude'} is busy, retrying automatically`} text={`Retry ${wait.attempt} of ${wait.retries} in ${Math.max(0, Math.ceil((wait.until - Date.now()) / 1000))}s. Busy replies aren't billed.`}>
          <div className="chips"><button type="button" className="link-btn" onClick={cancel}>Cancel</button></div>
        </Banner>
      )}
      {state.status === 'loading' && <div className="ai-grid">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div>}
      {state.status === 'error' && <Banner tone="bad" title="Insights failed" text={state.error} />}
      {state.status === 'ready' && (
        <>
          <div className="ai-grid fade-in">
            {SECTIONS.map(([k, title]) => (
              <div className="ai-card" key={k}>
                <h4>{title}</h4>
                {bullets(state.result[k]).map((b, i) => <p key={i}>• {b}</p>)}
              </div>
            ))}
          </div>
          <div className="chat" aria-live="polite">
            {chat.map((m, i) => <div key={i} className={`bubble ${m.role === 'user' ? 'me' : ''}`} style={m.error ? { color: 'var(--bad)' } : undefined}>{m.text}</div>)}
            {busy && <div className="bubble c-muted">Thinking…</div>}
            <div ref={endRef} />
          </div>
          <div className="chips" style={{ marginBottom: 10 }}>
            {SUGGESTIONS.map((q) => <button key={q} className="seg" style={{ border: 0, padding: '6px 12px', color: 'var(--muted)', cursor: 'pointer', fontSize: 12 }} onClick={() => send(q)}>{q}</button>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: 'flex', gap: 8 }}>
            <input className="field" style={{ flex: 1 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this period…" aria-label="Ask a follow-up question" />
            <button className="btn" disabled={busy || !input.trim()}>Ask</button>
          </form>
        </>
      )}
    </Card>
  );
}
