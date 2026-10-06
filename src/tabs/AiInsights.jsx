import { useEffect, useRef, useState } from 'react';
import { Card, Banner } from '../components/ui.jsx';
import { askClaude } from '../lib/api.js';
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

Respond ONLY with JSON (no markdown, no backticks) with these string keys, each holding 2-4 bullet points separated by newlines and starting with "•":
performance, anomalies, recommendations (3, ranked), channels, states, skus (movement in top SKUs vs prior period).`;
}

const bullets = (s) => String(s || '—').split('•').map((t) => t.trim()).filter(Boolean);

export default function AiInsights({ ctx }) {
  const [state, setState] = useState({ status: 'idle', result: null, error: '' });
  const [chat, setChat] = useState([]); // visible messages
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const history = useRef([]);
  const endRef = useRef(null);

  // A different period invalidates earlier insights.
  useEffect(() => { setState({ status: 'idle', result: null, error: '' }); setChat([]); history.current = []; }, [ctx.period, ctx.mode]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [chat]);

  async function generate() {
    setState({ status: 'loading', result: null, error: '' });
    const prompt = buildPrompt(ctx);
    try {
      const text = await askClaude({ system: SYSTEM, messages: [{ role: 'user', content: prompt }] });
      let result;
      try { result = JSON.parse(text); } catch { result = { performance: text }; }
      history.current = [{ role: 'user', content: `Current ops data context:\n${prompt}` }, { role: 'assistant', content: text }];
      setState({ status: 'ready', result, error: '' });
    } catch (e) {
      setState({ status: 'error', result: null, error: e.message });
    }
  }

  async function send(q) {
    const text = (q ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setChat((c) => [...c, { role: 'user', text }]);
    history.current.push({ role: 'user', content: text });
    try {
      const reply = await askClaude({
        system: 'You are a sharp ops analyst for Snackible. Answer questions about the ops data concisely. Use numbers from the data. Max 3-4 sentences. No filler.',
        messages: history.current,
      });
      history.current.push({ role: 'assistant', content: reply });
      setChat((c) => [...c, { role: 'assistant', text: reply }]);
    } catch (e) {
      history.current.pop();
      setChat((c) => [...c, { role: 'assistant', text: `Couldn't get an answer: ${e.message}`, error: true }]);
    }
    setBusy(false);
  }

  return (
    <Card
      title="AI analysis"
      sub={`Commentary on ${ctx.label}`}
      actions={<button className="btn" onClick={generate} disabled={state.status === 'loading'}>{state.status === 'loading' ? 'Analysing…' : state.result ? 'Regenerate' : 'Generate insights'}</button>}
    >
      {state.status === 'idle' && <p className="c-muted" style={{ maxWidth: '60ch' }}>Generate a written read on this period: what moved, what looks off, and what to do first. You can ask follow-up questions afterwards.</p>}
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
