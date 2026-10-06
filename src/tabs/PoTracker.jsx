import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Card, Dot, Empty, FillBar, Kpi } from '../components/ui.jsx';
import { band, fmtL, fmtN, fmtPct, isMonthKey, monthKeySort, periodLabel } from '../lib/format.js';
import { chartTheme } from '../theme.js';

const axis = { tick: { fill: chartTheme.tick, fontSize: 11 }, axisLine: false, tickLine: false };
const sumFill = (b) => Object.values(b?.channel_fill || {}).reduce((s, v) => ({ po: s.po + v.po, inv: s.inv + v.inv }), { po: 0, inv: 0 });
const tone = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' };
const legend = <Legend wrapperStyle={{ fontSize: 12, color: chartTheme.tick }} iconType="circle" iconSize={8} />;

export default function PoTracker({ ctx }) {
  const { data, mode, d, prev, label } = ctx;
  const weekly = data.weekly || {};
  const weeks = Object.keys(weekly).filter((k) => weekly[k].orders > 0).sort();
  const last8 = weeks.slice(-8);
  const trend = last8.map((w) => {
    const t = sumFill(weekly[w]);
    return { name: periodLabel(w, 'weekly').split(' – ')[0], po: t.po, inv: t.inv, fill: t.po > 0 ? +((t.inv / t.po) * 100).toFixed(1) : 0 };
  });
  const months = Object.keys(data.monthly || {}).filter(isMonthKey).sort(monthKeySort).map((m) => {
    const t = sumFill(data.monthly[m]);
    return { name: m, po: t.po, inv: t.inv };
  });

  const t = sumFill(d);
  const short = Math.max(0, t.po - t.inv);
  const fill = t.po > 0 ? Math.min(t.inv / t.po, 1) : 0;
  const ov = d.total_order_val || 0, iv = d.total_inv_val || 0;
  const valRate = ov > 0 ? Math.min(iv / ov, 1) : 0;
  const pt = prev ? sumFill(prev) : null;
  const chg = (a, b) => (b > 0 ? ((a - b) / b) * 100 : null);
  const poChg = pt && chg(t.po, pt.po), invChg = pt && chg(t.inv, pt.inv);
  const pill = (c) => (c == null ? undefined : { tone: c >= 0 ? 'good' : 'bad', text: `${c >= 0 ? '▲' : '▼'} ${Math.abs(c).toFixed(1)}% vs prior` });

  const rows = Object.entries(d.channel_fill || {}).filter(([, v]) => v.po > 0 || v.inv > 0).sort((a, b) => b[1].po - a[1].po);
  const skus = Object.entries(d.skus || {}).sort((a, b) => b[1] - a[1]);

  const poBar = (data_) => (
    <div className="chart-box"><ResponsiveContainer>
      <BarChart data={data_} margin={{ top: 8, right: 4, left: -6, bottom: 0 }}>
        <CartesianGrid stroke={chartTheme.grid} vertical={false} />
        <XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={fmtN} />
        <Tooltip contentStyle={chartTheme.tooltip} cursor={{ fill: 'rgba(255,255,255,0.03)' }} formatter={(v) => fmtN(v)} />
        {legend}
        <Bar dataKey="po" name="PO qty" fill="#E2B14A" radius={[5, 5, 0, 0]} />
        <Bar dataKey="inv" name="Invoice qty" fill="#4FB59E" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer></div>
  );

  if (!t.po && !rows.length) return <Empty title="No PO data for this period" hint="Pick a different period in the header." />;

  return (
    <div className="stack fade-in">
      <div className="grid g-kpi">
        <Kpi label="PO quantity" value={fmtN(t.po)} badge={pill(poChg)} />
        <Kpi label="Invoice quantity" value={fmtN(t.inv)} badge={pill(invChg)} />
        <Kpi label="Fill rate (qty)" value={(fill * 100).toFixed(1) + '%'} badge={{ tone: band(fill, 0.95, 0.85), text: fill >= 0.95 ? 'Healthy' : fill >= 0.85 ? 'Moderate' : 'Below target' }} />
        <Kpi label="Short supply" value={fmtN(short)} badge={{ tone: short === 0 ? 'good' : 'warn', text: short === 0 ? 'Fully fulfilled' : 'units short' }} />
        <Kpi label="Value fulfilment" value={(valRate * 100).toFixed(1) + '%'} sub={`${fmtL(iv)} of ${fmtL(ov)} ordered`}>
          <span className="kpi-value num">{(valRate * 100).toFixed(1)}%</span>
          <div className="bar-track" style={{ height: 5 }}><div className="bar-fill" style={{ width: valRate * 100 + '%', background: tone[band(valRate, 0.95, 0.85)] }} /></div>
          <span className="kpi-sub">{fmtL(iv)} of {fmtL(ov)} ordered · {fmtL(Math.max(0, ov - iv))} short</span>
        </Kpi>
      </div>

      <div className="grid g-1-1">
        <Card title="PO vs invoice, weekly" sub="Last 8 weeks">{poBar(trend)}</Card>
        <Card title="Fill rate, weekly" sub="Last 8 weeks against 95% target">
          <div className="chart-box"><ResponsiveContainer>
            <LineChart data={trend} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="name" {...axis} /><YAxis {...axis} domain={[0, 110]} tickFormatter={(v) => v + '%'} />
              <Tooltip contentStyle={chartTheme.tooltip} formatter={(v) => v + '%'} />
              <ReferenceLine y={95} stroke={chartTheme.good} strokeDasharray="5 4" strokeOpacity={0.5} />
              <Line type="monotone" dataKey="fill" name="Fill rate" stroke="#5E9FD0" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: '#5E9FD0' }} />
            </LineChart>
          </ResponsiveContainer></div>
        </Card>
      </div>

      <Card title="PO vs invoice, monthly" sub="All months">{poBar(months)}</Card>

      <div className="grid g-2-1">
        <Card title="PO vs invoice by channel" sub={label}>
          <div className="table-wrap"><table>
            <thead><tr><th>Channel</th><th className="r">PO qty</th><th className="r">Invoiced</th><th>Fill</th><th className="r">Short</th><th className="r">Short %</th></tr></thead>
            <tbody>{rows.map(([ch, v]) => {
              const rate = v.po > 0 ? Math.min(v.inv / v.po, 1) : v.inv > 0 ? 1 : 0;
              const sh = Math.max(0, v.po - v.inv);
              return (
                <tr key={ch}><td><Dot name={ch} />{ch}</td><td className="r num c-muted">{fmtN(v.po)}</td><td className="r num c-good">{fmtN(v.inv)}</td>
                  <td><FillBar rate={rate} /></td><td className="r num c-warn" style={{ fontWeight: 600 }}>{sh > 0 ? fmtN(sh) : '—'}</td>
                  <td className="r num c-faint">{v.po > 0 && sh > 0 ? ((sh / v.po) * 100).toFixed(1) + '%' : '—'}</td></tr>
              );
            })}</tbody>
          </table></div>
        </Card>
        <Card title="SKU volume" sub="Units ordered">
          {skus.length ? (
            <div className="table-wrap scroll-y"><table><tbody>
              {skus.map(([n, q]) => <tr key={n}><td style={{ whiteSpace: 'normal', fontSize: 12 }}>{n}</td><td className="r num c-warn">{fmtN(q)}</td></tr>)}
            </tbody></table></div>
          ) : <Empty title="No SKU quantities" />}
        </Card>
      </div>
    </div>
  );
}
