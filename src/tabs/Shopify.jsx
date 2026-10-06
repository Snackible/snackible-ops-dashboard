import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Delta, Empty, FillBar, Kpi, Skeleton } from '../components/ui.jsx';
import { MONTHS, band, fmtL, fmtN } from '../lib/format.js';
import { chartTheme } from '../theme.js';

const axis = { tick: { fill: chartTheme.tick, fontSize: 11 }, axisLine: false, tickLine: false };
const ZONES = ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E'];
const SLA = { 'Zone A': 2, 'Zone B': 3, 'Zone C': 5, 'Zone D': 7, 'Zone E': 10 };
const tone = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' };
const legend = <Legend wrapperStyle={{ fontSize: 12, color: chartTheme.tick }} iconType="circle" iconSize={8} />;

// B2C data is cut off before Nov 2025, matching the previous dashboard.
function validKey(k) {
  const [m, y] = k.split(' ');
  const mi = MONTHS.indexOf(m), yr = parseInt(y, 10);
  return mi >= 0 && (yr >= 2026 || (yr === 2025 && mi >= 10));
}

export default function Shopify({ ctx }) {
  const sh = ctx.extras.shopify;
  const [picked, setPicked] = useState('');

  if (!sh) return <div className="stack"><div className="grid g-kpi">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={100} />)}</div><Skeleton h={300} /></div>;
  const raw = sh.monthly;
  if (!raw) return <Empty title="Shopify data unavailable" hint="This tab is the one part still served by the Apps Script feed, because Shopify isn't in the spreadsheet. The feed didn't return monthly figures." />;

  const keys = Object.keys(raw).filter(validKey).sort((a, b) => {
    const [aM, aY] = a.split(' '), [bM, bY] = b.split(' ');
    return parseInt(bY) - parseInt(aY) || MONTHS.indexOf(bM) - MONTHS.indexOf(aM);
  });
  if (!keys.length) return <Empty title="No months available" />;
  const sel = keys.includes(picked) ? picked : keys[0];
  const d = raw[sel];
  const prev = raw[keys[keys.indexOf(sel) + 1]];
  const trendKeys = keys.slice(0, 8).reverse();
  const monthKeys = [...keys].reverse();
  const money = (ks) => ks.map((k) => ({ name: k, inv: raw[k]?.invoiceValue || 0, cost: raw[k]?.logisticsCost || 0, pct: raw[k]?.logCostPct || 0 }));
  const couriers = Object.entries(d.couriers || {}).sort((a, b) => b[1].orders - a[1].orders).slice(0, 10);
  const vendors = Object.entries(d.vendors || {}).sort((a, b) => b[1].orders - a[1].orders);

  const moneyBars = (rows) => (
    <div className="chart-box"><ResponsiveContainer>
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -6, bottom: 0 }}>
        <CartesianGrid stroke={chartTheme.grid} vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={fmtL} />
        <Tooltip contentStyle={chartTheme.tooltip} cursor={{ fill: 'rgba(255,255,255,0.03)' }} formatter={(v) => fmtL(v)} />
        {legend}
        <Bar isAnimationActive={false} dataKey="inv" name="Invoice value" fill="#4FB59E" radius={[5, 5, 0, 0]} />
        <Bar isAnimationActive={false} dataKey="cost" name="Logistics cost" fill="#5E9FD0" radius={[5, 5, 0, 0]} />
      </BarChart>
    </ResponsiveContainer></div>
  );

  return (
    <div className="stack fade-in">
      <div className="controls">
        <select className="field" aria-label="Month" value={sel} onChange={(e) => setPicked(e.target.value)}>
          {keys.map((k, i) => <option key={k} value={k}>{k}{i === 0 ? ' (latest)' : ''}</option>)}
        </select>
      </div>
      <div className="grid g-kpi">
        <Kpi label="Invoice value"><span className="kpi-value num">{fmtL(d.invoiceValue)}</span><Delta now={d.invoiceValue} prior={prev?.invoiceValue} /></Kpi>
        <Kpi label="Logistics cost" value={fmtL(d.logisticsCost)} sub={`${d.logCostPct}% of invoice value`} badge={{ tone: band(d.logCostPct, 15, 20, false), text: d.logCostPct + '% cost ratio' }} />
        <Kpi label="Average TAT" value={d.avgTAT > 0 ? d.avgTAT + 'd' : '—'} badge={{ tone: band(d.avgTAT, 5, 8, false), text: d.avgTAT <= 5 ? 'Fast' : d.avgTAT <= 8 ? 'Moderate' : 'Slow' }} />
        <Kpi label="Shipments" value={fmtN(d.shipments)} sub={prev ? `${d.shipments >= prev.shipments ? '+' : '−'}${fmtN(Math.abs(d.shipments - prev.shipments))} vs prior` : undefined} />
        <Kpi label="RTO" value={d.rtoPct + '%'} badge={{ tone: band(d.rtoPct, 10, 15, false), text: d.rtoPct <= 10 ? 'Acceptable' : 'High RTO' }} />
        <Kpi label="Delivery rate" value={d.deliveryRate + '%'} badge={{ tone: band(d.deliveryRate, 85, 75), text: d.deliveryRate >= 85 ? 'Healthy' : 'Below target' }} />
      </div>
      <div className="grid g-1-1">
        <Card title="Invoice value and logistics cost" sub="Last 8 months">{moneyBars(money(trendKeys))}</Card>
        <Card title="Logistics cost as % of invoice value" sub="Against 15% target">
          <div className="chart-box"><ResponsiveContainer>
            <LineChart data={money(trendKeys)} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={(v) => v + '%'} />
              <Tooltip contentStyle={chartTheme.tooltip} formatter={(v) => v + '%'} />
              <ReferenceLine y={15} stroke="#9aa79f" strokeDasharray="5 4" strokeOpacity={0.5} />
              <Line isAnimationActive={false} type="monotone" dataKey="pct" name="Cost %" stroke="#E2B14A" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 0, fill: '#E2B14A' }} />
            </LineChart>
          </ResponsiveContainer></div>
        </Card>
      </div>

      <Card title="Zone-wise TAT" sub={`${sel} · SLA A=2d, B=3d, C=5d, D=7d, E=10d`}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
          {ZONES.map((z) => {
            const zd = d.zonePerf?.[z] || { beforeTAT: 0, afterTAT: 0, total: 0 };
            const p = zd.total > 0 ? zd.beforeTAT / zd.total : 0;
            return (
              <div key={z} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 600 }}>{z} <span className="c-faint" style={{ fontWeight: 400, fontSize: 12 }}>≤ {SLA[z]} days</span></div>
                <div className="num" style={{ fontSize: 28, fontWeight: 600, color: tone[band(p, 0.85, 0.7)], margin: '6px 0 2px' }}>{(p * 100).toFixed(1)}%</div>
                <div className="c-faint" style={{ fontSize: 12, marginBottom: 10 }}>on time · {fmtN(zd.total)} shipments</div>
                <FillBar rate={p} tone={band(p, 0.85, 0.7)} />
                <dl style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 4, fontSize: 12, marginTop: 12 }} className="c-muted">
                  <dt>Average TAT</dt><dd className="num" style={{ color: 'var(--text)' }}>{zd.avgTAT > 0 ? zd.avgTAT + 'd' : '—'}</dd>
                  <dt>Total cost</dt><dd className="num" style={{ color: 'var(--text)' }}>{fmtL(zd.logisticsCost)}</dd>
                  <dt>Cost ratio</dt><dd className="num" style={{ color: 'var(--text)' }}>{zd.logCostPct || 0}%</dd>
                  <dt>Per order</dt><dd className="num" style={{ color: 'var(--text)' }}>₹{zd.avgCost || 0}</dd>
                </dl>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid g-1-1">
        <Card title="Courier performance" sub={`${sel} · top 10`}>
          {couriers.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Courier</th><th className="r">Orders</th><th className="r">Avg TAT</th><th>Delivery rate</th><th className="r">RTO</th><th className="r">Cost / order</th></tr></thead>
              <tbody>{couriers.map(([n, c]) => (
                <tr key={n}><td style={{ fontWeight: 500 }}>{n}</td><td className="r num c-muted">{fmtN(c.orders)}</td>
                  <td className="r num" style={{ color: c.avgTAT > 0 ? tone[band(c.avgTAT, 5, 8, false)] : undefined, fontWeight: 600 }}>{c.avgTAT > 0 ? c.avgTAT + 'd' : '—'}</td>
                  <td><FillBar rate={c.deliveryRate / 100} tone={c.deliveryRate >= 85 ? 'good' : 'bad'} /></td>
                  <td className={`r num ${c.rtoPct > 15 ? 'c-bad' : 'c-muted'}`}>{c.rtoPct}%</td><td className="r num c-warn">₹{c.avgCost}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <Empty title="No courier data" />}
        </Card>
        <Card title="Vendor performance" sub={sel}>
          {vendors.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Vendor</th><th className="r">Orders</th><th className="r">Invoice value</th><th className="r">Cost</th><th className="r">RTO</th></tr></thead>
              <tbody>{vendors.map(([n, v]) => {
                const r = v.orders > 0 ? (v.rto / v.orders) * 100 : 0;
                return <tr key={n}><td style={{ fontWeight: 500 }}>{n}</td><td className="r num c-muted">{fmtN(v.orders)}</td><td className="r num c-good">{fmtL(v.invoiceValue)}</td><td className="r num c-warn">{fmtL(v.cost)}</td><td className={`r num ${r > 15 ? 'c-bad' : 'c-muted'}`}>{r.toFixed(1)}%</td></tr>;
              })}</tbody>
            </table></div>
          ) : <Empty title="No vendor data" />}
        </Card>
      </div>

      <Card title="Monthly B2C performance" sub="Invoice value against logistics cost">{moneyBars(money(monthKeys))}</Card>
    </div>
  );
}
