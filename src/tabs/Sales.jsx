import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceDot } from 'recharts';
import { Banner, Badge, Card, Delta, Empty, Ring, Segmented } from '../components/ui.jsx';
import { useCountUp } from '../hooks/useCountUp.js';
import { band, fmtL, fmtN, fmtPct, monthKeySort, periodLabel } from '../lib/format.js';
import { CHANNEL_COLORS, chartTheme } from '../theme.js';
import AiInsights from './AiInsights.jsx';

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

function SalesHero({ d, prev, label, mode, isLatest, trend }) {
  const gmv = useCountUp(d.gmv);
  const dup = d.statuses?.Duplicate || 0;
  const fillTone = band(d.avg_fill, 95, 85);
  const rto = d.rto_pct <= 3 ? 'good' : d.rto_pct <= 5 ? 'warn' : 'bad';
  const dn = d.dn_value === 0 ? 'good' : d.dn_value < 50000 ? 'warn' : 'bad';
  const unit = { weekly: 'week', monthly: 'month', daily: 'day' }[mode] || 'period';
  const hasTat = d.avg_total_tat > 0;
  return (
    <section className="hero" aria-label="Headline numbers">
      <div className="hero-main">
        <div className="hero-eyebrow"><span>{label}</span>{isLatest && <span className="tag">Latest</span>}</div>
        <div className="hero-label">Invoiced revenue (GMV)</div>
        <div className="hero-value">{fmtL(gmv)}</div>
        <div className="hero-delta">
          {prev ? <><Delta now={d.gmv} prior={prev.gmv} suffix="%" /><span>vs the previous {unit}</span></> : <Badge tone="neutral">First period</Badge>}
        </div>
        {trend.length > 1 && (
          <div className="hero-spark" aria-hidden="true">
            <ResponsiveContainer>
              <AreaChart data={trend} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="heroFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <Area isAnimationActive={false} type="monotone" dataKey="gmv" stroke="var(--gold)" strokeWidth={2.5} fill="url(#heroFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="hero-side">
        <div className="mini-stat ring-tile">
          <Ring value={d.avg_fill} tone={fillTone} />
          <div>
            <div className="mini-label">Fill rate</div>
            <div className="mini-value">{d.avg_fill}%</div>
            <Badge tone={fillTone}>{d.avg_fill >= 95 ? 'Healthy' : d.avg_fill >= 85 ? 'Moderate' : 'Below target'}</Badge>
          </div>
        </div>
        <div className="mini-stat">
          <span className="mini-label">Orders</span>
          <span className="mini-value">{fmtN(d.orders)}</span>
          <span className="mini-sub">{dup ? `${dup} duplicates excluded` : 'No duplicates'}</span>
        </div>
        <div className="mini-stat">
          <span className="mini-label">Days to deliver</span>
          <span className="mini-value">{hasTat ? d.avg_total_tat : '—'}</span>
          <span className="mini-sub">{hasTat ? ([d.avg_proc_tat > 0 && `${d.avg_proc_tat} to dispatch`, d.avg_tran_tat > 0 && `${d.avg_tran_tat} in transit`].filter(Boolean).join(' · ') || 'PO to delivery') : 'Waiting for deliveries'}</span>
        </div>
        <div className="mini-stat">
          <span className="mini-label">Returned (RTO)</span>
          <span className="mini-value">{d.rto_pct}%</span>
          <Badge tone={rto}>{d.rto_pct === 0 ? 'No RTOs' : d.rto_pct <= 3 ? 'Acceptable' : 'High'}</Badge>
        </div>
        <div className="mini-stat">
          <span className="mini-label">Discrepancies (DN)</span>
          <span className="mini-value">{fmtL(d.dn_value)}</span>
          <Badge tone={dn}>{d.dn_value === 0 ? 'None' : d.dn_value < 50000 ? 'Low exposure' : 'Review needed'}</Badge>
        </div>
      </div>
    </section>
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
      <SalesHero d={d} prev={prev} label={label} mode={mode} isLatest={isLatest} trend={trend} />
      <div className="grid g-1-1">
        <Card title="GMV by channel" sub={`${label} · invoice value`}>
          {channels.length ? (
            <div className="chart-box"><ResponsiveContainer>
              <BarChart data={channels} margin={{ top: 8, right: 4, left: -6, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 7" stroke={chartTheme.grid} vertical={false} />
                <XAxis dataKey="name" {...axis} interval={0} />
                <YAxis {...axis} tickFormatter={fmtL} />
                <Tooltip contentStyle={chartTheme.tooltip} cursor={chartTheme.cursor} formatter={(v) => fmtL(v)} labelFormatter={(_, p) => p?.[0]?.payload?.full} />
                <Bar isAnimationActive={false} dataKey="v" radius={[10, 10, 3, 3]} maxBarSize={64}>
                  {channels.map((c) => <Cell key={c.full} fill={CHANNEL_COLORS[c.full] || CHANNEL_COLORS.Others} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer></div>
          ) : <Empty title="No invoiced value yet" hint="Channels appear once invoices are raised." />}
        </Card>
        <Card title="GMV trend" sub={`Last ${win === 99 ? 'all' : win} periods`} actions={<Segmented label="Trend window" value={win} onChange={setWin} options={[[4, '4'], [8, '8'], [99, 'All']]} />}>
          <div className="chart-box"><ResponsiveContainer>
            <AreaChart data={trend} margin={{ top: 8, right: 8, left: -6, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 7" stroke={chartTheme.grid} vertical={false} />
              <XAxis dataKey="name" {...axis} />
              <YAxis {...axis} tickFormatter={fmtL} />
              <Tooltip contentStyle={chartTheme.tooltip} formatter={(v) => fmtL(v)} />
              <Area isAnimationActive={false} type="monotone" dataKey="gmv" stroke={chartTheme.accent} strokeWidth={2.5} fill="url(#trendFill)" dot={{ r: 3, fill: chartTheme.accent, strokeWidth: 0 }} />
              {trend.find((t) => t.p === period) && <ReferenceDot x={trend.find((t) => t.p === period).name} y={trend.find((t) => t.p === period).gmv} r={6} fill="var(--text)" stroke={chartTheme.accent} strokeWidth={2} />}
            </AreaChart>
          </ResponsiveContainer></div>
        </Card>
      </div>
      <AiInsights ctx={ctx} />
    </div>
  );
}
