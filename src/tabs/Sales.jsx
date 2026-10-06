import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceDot } from 'recharts';
import { Banner, Badge, Card, Delta, Empty, Kpi, Segmented } from '../components/ui.jsx';
import { band, fmtL, fmtN, fmtPct, monthKeySort, periodLabel } from '../lib/format.js';
import { CHANNEL_COLORS, chartTheme } from '../theme.js';
import AiInsights from './AiInsights.jsx';

const BADGE = { good: 'good', warn: 'warn', bad: 'bad' };

export function StatusBanner({ d, isLatest, resetKey }) {
  const bad = Object.entries(d.channel_fill || {}).filter(([, v]) => v.po > 0 && v.rate < 0.9).sort((a, b) => a[1].rate - b[1].rate);
  if (isLatest && d.orders < 50) {
    return <Banner dismissible resetKey={resetKey} tone="info" title="Open period, data incomplete" text="Orders in this period are still being fulfilled, so fill and TAT will move." />;
  }
  if (!bad.length) return <Banner dismissible resetKey={resetKey} tone="good" title="All channels above 90% fill" text="Every active channel is meeting its fill-rate floor this period." />;
  return (
    <Banner dismissible resetKey={resetKey} tone="warn" title="Short supply on some channels" text={bad.map(([ch, v]) => `${ch} at ${fmtPct(v.rate)}`).join(', ') + '.'}>
      <div className="chips">
        {bad.map(([ch, v]) => <Badge key={ch} tone="warn">{ch}: {fmtN(v.short)} units short</Badge>)}
      </div>
    </Banner>
  );
}

function tatKpi(d) {
  if (!(d.avg_total_tat > 0)) {
    return <Kpi label="Average TAT (days)" value="—" sub="Waiting for deliveries" badge={{ tone: 'neutral', text: 'No data yet' }} />;
  }
  return (
    <Kpi label="Average TAT (days)" sub="PO to delivery" badge={{ tone: d.avg_total_tat <= 10 ? 'good' : 'warn', text: d.avg_total_tat <= 10 ? 'Within 10 days' : 'Running slow' }}>
      <div className="kpi-multi">
        <div><small>Total</small><span className="kpi-value num">{d.avg_total_tat}</span></div>
        <div><small>PO→Disp</small><span className="num" style={{ fontSize: 17, fontWeight: 600 }}>{d.avg_proc_tat}</span></div>
        <div><small>Disp→Del</small><span className="num" style={{ fontSize: 17, fontWeight: 600 }}>{d.avg_tran_tat}</span></div>
      </div>
    </Kpi>
  );
}

export function SalesKpis({ d, prev }) {
  const dup = d.statuses?.Duplicate || 0;
  const fill = band(d.avg_fill, 95, 85);
  const rto = d.rto_pct <= 3 ? 'good' : d.rto_pct <= 5 ? 'warn' : 'bad';
  const dn = d.dn_value === 0 ? 'good' : d.dn_value < 50000 ? 'warn' : 'bad';
  return (
    <div className="grid g-kpi">
      <Kpi label="GMV (invoiced)" value={fmtL(d.gmv)}>
        <span className="kpi-value num">{fmtL(d.gmv)}</span>
        {prev ? <Delta now={d.gmv} prior={prev.gmv} /> : <Badge tone="neutral">First period</Badge>}
      </Kpi>
      <Kpi label="Orders" value={fmtN(d.orders)} sub={dup ? `${dup} duplicates excluded` : 'No duplicates'} />
      <Kpi label="Fill rate" value={d.avg_fill + '%'} badge={{ tone: BADGE[fill], text: d.avg_fill >= 95 ? 'Healthy' : d.avg_fill >= 85 ? 'Moderate' : 'Below target' }} />
      {tatKpi(d)}
      <Kpi label="RTO" value={d.rto_pct + '%'} badge={{ tone: rto, text: d.rto_pct === 0 ? 'No RTOs' : d.rto_pct <= 3 ? 'Acceptable' : 'High' }} />
      <Kpi label="Discrepancy (DN) value" value={fmtL(d.dn_value)} badge={{ tone: dn, text: d.dn_value === 0 ? 'None' : d.dn_value < 50000 ? 'Low exposure' : 'Review needed' }} />
    </div>
  );
}

const axis = { tick: { fill: chartTheme.tick, fontSize: 11 }, axisLine: false, tickLine: false };

export default function Sales({ ctx }) {
  const { d, prev, period, mode, periods, label, isLatest, data } = ctx;
  const [win, setWin] = useState(8);

  const chron = mode === 'monthly' ? [...periods].sort(monthKeySort) : [...periods].reverse();
  const sel = chron.indexOf(period);
  const slice = chron.slice(win === 99 ? 0 : Math.max(0, sel + 1 - win), sel + 1);
  const trend = slice.map((p) => ({ p, name: periodLabel(p, mode).split(' – ')[0], gmv: ctx.bucket[p]?.gmv || 0 }));
  const channels = Object.entries(d.channels || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ name: k.includes(' - ') ? k.split(' - ')[0] : k, full: k, v }));

  return (
    <div className="stack fade-in">
      <StatusBanner d={d} isLatest={isLatest} resetKey={`${mode}:${period}`} />
      <SalesKpis d={d} prev={prev} />
      <div className="grid g-1-1">
        <Card title="GMV by channel" sub={`${label} · invoice value`}>
          {channels.length ? (
            <div className="chart-box"><ResponsiveContainer>
              <BarChart data={channels} margin={{ top: 8, right: 4, left: -6, bottom: 0 }}>
                <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                <XAxis dataKey="name" {...axis} interval={0} />
                <YAxis {...axis} tickFormatter={fmtL} />
                <Tooltip contentStyle={chartTheme.tooltip} cursor={{ fill: 'rgba(255,255,255,0.03)' }} formatter={(v) => fmtL(v)} labelFormatter={(_, p) => p?.[0]?.payload?.full} />
                <Bar isAnimationActive={false} dataKey="v" radius={[6, 6, 0, 0]}>
                  {channels.map((c) => <Cell key={c.full} fill={CHANNEL_COLORS[c.full] || CHANNEL_COLORS.Others} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer></div>
          ) : <Empty title="No invoiced value yet" hint="Channels appear once invoices are raised." />}
        </Card>
        <Card title="GMV trend" sub={`Last ${win === 99 ? 'all' : win} periods`} actions={<Segmented label="Trend window" value={win} onChange={setWin} options={[[4, '4'], [8, '8'], [99, 'All']]} />}>
          <div className="chart-box"><ResponsiveContainer>
            <LineChart data={trend} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
              <CartesianGrid stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="name" {...axis} />
              <YAxis {...axis} tickFormatter={fmtL} />
              <Tooltip contentStyle={chartTheme.tooltip} formatter={(v) => fmtL(v)} />
              <Line isAnimationActive={false} type="monotone" dataKey="gmv" stroke={chartTheme.accent} strokeWidth={2.5} dot={{ r: 3, fill: chartTheme.accent, strokeWidth: 0 }} />
              {trend.find((t) => t.p === period) && <ReferenceDot x={trend.find((t) => t.p === period).name} y={trend.find((t) => t.p === period).gmv} r={6} fill="#eceee8" stroke={chartTheme.accent} strokeWidth={2} />}
            </LineChart>
          </ResponsiveContainer></div>
        </Card>
      </div>
      <AiInsights ctx={ctx} />
    </div>
  );
}
