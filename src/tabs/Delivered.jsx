import { useMemo, useState } from 'react';
import { Card, Dot, Empty, Kpi } from '../components/ui.jsx';
import { MONTHS, fmtL, fmtN } from '../lib/format.js';

const LIMIT = 500;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
function keyOf(t, mode) {
  const d = new Date(t);
  if (mode === 'monthly') return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (mode === 'daily') return iso(t);
  return iso(t - ((d.getUTCDay() + 6) % 7) * 864e5); // Monday
}
function labelOf(k, mode) {
  if (mode === 'monthly') return k;
  const d = new Date(k + 'T00:00:00Z');
  if (mode === 'daily') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const e = new Date(d.getTime() + 6 * 864e5);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} – ${MONTHS[e.getUTCMonth()]} ${e.getUTCDate()}`;
}

export default function Delivered({ ctx }) {
  const log = ctx.data.delivered_log || [];
  const [mode, setMode] = useState(['weekly', 'monthly', 'daily'].includes(ctx.mode) ? ctx.mode : 'weekly');
  const [picked, setPicked] = useState('');

  const groups = useMemo(() => {
    const g = new Map();
    log.forEach((i) => {
      if (!i._time) return;
      const k = keyOf(i._time, mode);
      if (!g.has(k)) g.set(k, []);
      g.get(k).push(i);
    });
    return g;
  }, [log, mode]);
  const periods = useMemo(() => [...groups.keys()].sort((a, b) => (mode === 'monthly' ? new Date('1 ' + b) - new Date('1 ' + a) : b.localeCompare(a))), [groups, mode]);
  const period = groups.has(picked) ? picked : periods[0];
  const rows = period ? groups.get(period) : [];
  const total = rows.reduce((s, r) => s + r.val, 0);

  if (!log.length) return <Empty title="No delivered orders" hint="Delivered orders with a delivery date appear here." />;

  return (
    <div className="stack fade-in">
      <div className="controls">
        <select className="field" aria-label="Group by" value={mode} onChange={(e) => { setMode(e.target.value); setPicked(''); }}>
          <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
        </select>
        <select className="field" aria-label="Delivery period" value={period} onChange={(e) => setPicked(e.target.value)}>
          {periods.map((p, i) => <option key={p} value={p}>{labelOf(p, mode)}{i === 0 ? ' (latest)' : ''}</option>)}
        </select>
      </div>
      <div className="grid g-kpi">
        <Kpi label="Delivered orders" value={fmtN(rows.length)} />
        <Kpi label="Invoice value" value={fmtL(total)} />
        <Kpi label="Average order value" value={fmtL(rows.length ? Math.round(total / rows.length) : 0)} />
      </div>
      <Card title="Delivered orders" sub={`Filtered by delivery date · ${labelOf(period, mode)} · ${fmtN(rows.length)} orders${rows.length > LIMIT ? `, showing first ${LIMIT}` : ''}`}>
        {rows.length ? (
          <div className="table-wrap scroll-y" style={{ maxHeight: 560 }}><table>
            <thead><tr><th>PO date</th><th>Delivered</th><th>Ref</th><th>PO</th><th>Channel</th><th className="r">Invoice value</th></tr></thead>
            <tbody>
              {rows.slice(0, LIMIT).map((r) => (
                <tr key={r.ref + r.date + r.po}>
                  <td className="num c-muted">{r.po_date || '—'}</td><td className="num c-good">{r.date}</td>
                  <td style={{ fontWeight: 600 }}>{r.ref}</td><td className="c-muted" style={{ fontSize: 12 }}>{r.po}</td>
                  <td><Dot name={r.channel} />{r.channel}</td><td className="r num c-warn" style={{ fontWeight: 600 }}>{fmtL(r.val)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        ) : <Empty title="No deliveries in this period" />}
      </Card>
    </div>
  );
}
