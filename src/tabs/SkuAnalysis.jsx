import { useMemo, useState } from 'react';
import { Badge, Card, Empty, Kpi, Segmented, Skeleton, Spark } from '../components/ui.jsx';
import { fmtL, fmtU, monthKeySort, periodLabel, short } from '../lib/format.js';
import { SKU_CHANNEL_COLORS as COLORS, SKU_CHANNEL_ORDER as ORDER } from '../theme.js';

const sumVals = (o) => Object.values(o || {}).reduce((s, v) => s + v, 0);

function Pill({ now, prior }) {
  if (!prior) return <span className="c-faint">—</span>;
  const p = Math.round(((now - prior) / prior) * 100);
  return <Badge tone={p >= 0 ? 'good' : 'bad'}>{p >= 0 ? '▲' : '▼'} {Math.abs(p)}%</Badge>;
}
const ChanDot = ({ ch }) => <span className="ch-dot" style={{ background: COLORS[ch] || '#8E9C94' }} />;
const trendColor = (n, p) => (n > p ? 'var(--good)' : n < p ? 'var(--bad)' : 'var(--text)');

export default function SkuAnalysis({ ctx }) {
  const sa = ctx.extras.sku_analysis;
  const [mode, setMode] = useState('weekly');
  const [view, setView] = useState('units');
  const [topN, setTopN] = useState(10);
  const [pa, setPa] = useState('');
  const [pb, setPb] = useState('');
  const [level, setLevel] = useState('l1');
  const [chan, setChan] = useState(null);
  const [sku, setSku] = useState(null);

  const bucket = sa ? (view === 'value' ? sa[mode + '_value'] : sa[mode]) : null;
  const periods = useMemo(() => (bucket ? Object.keys(bucket).sort(mode === 'monthly' ? (a, b) => monthKeySort(b, a) : (a, b) => b.localeCompare(a)) : []), [bucket, mode]);

  if (!sa) return <div className="stack"><Skeleton h={90} /><div className="grid g-kpi">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={100} />)}</div></div>;
  if (!bucket) return <Empty title="Value data isn't available yet" hint="The feed has no value breakdown. Switch to units." />;
  if (!periods.length) return <Empty title="No SKU data" />;

  const A = periods.includes(pa) ? pa : periods[0];
  const B = periods.includes(pb) ? pb : periods[1] || periods[0];
  const dA = bucket[A] || {}, dB = bucket[B] || {};
  const lblA = periodLabel(A, mode), lblB = periodLabel(B, mode);
  const skuList = (sa.sku_list || []).slice(0, topN === 999 ? undefined : topN);
  const active = ORDER.filter((ch) => skuList.some((s) => dA[ch]?.[s] || dB[ch]?.[s]));
  const fmt = view === 'value' ? fmtL : fmtU;
  const trendPeriods = periods.slice(0, 6).reverse();
  const chanTotal = (data, ch) => sumVals(data[ch]);
  const skuTotal = (data, s) => active.reduce((t, ch) => t + (data[ch]?.[s] || 0), 0);
  const totalA = active.reduce((t, ch) => t + chanTotal(dA, ch), 0);
  const totalB = active.reduce((t, ch) => t + chanTotal(dB, ch), 0);
  const go = (l) => setLevel(l);

  const controls = (
    <div className="controls">
      <Segmented label="Period type" value={mode} onChange={(m) => { setMode(m); setPa(''); setPb(''); go('l1'); }} options={[['weekly', 'Weekly'], ['monthly', 'Monthly']]} />
      <Segmented label="Measure" value={view} onChange={setView} options={[['units', 'Units'], ['value', 'Value']]} />
      <select className="field" aria-label="Current period" value={A} onChange={(e) => setPa(e.target.value)}>{periods.map((p, i) => <option key={p} value={p}>{periodLabel(p, mode)}{i === 0 ? ' (latest)' : ''}</option>)}</select>
      <span className="c-faint">vs</span>
      <select className="field" aria-label="Comparison period" value={B} onChange={(e) => setPb(e.target.value)}>{periods.map((p) => <option key={p} value={p}>{periodLabel(p, mode)}</option>)}</select>
      <select className="field" aria-label="SKUs shown" value={topN} onChange={(e) => setTopN(+e.target.value)}>
        <option value={5}>Top 5 SKUs</option><option value={10}>Top 10 SKUs</option><option value={20}>Top 20 SKUs</option><option value={999}>All SKUs</option>
      </select>
    </div>
  );

  const crumbs = (
    <nav aria-label="Drill-down" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
      <button className="link-btn" onClick={() => go('l1')}>All channels</button>
      {level !== 'l1' && <><span className="c-faint">/</span><button className="link-btn" onClick={() => go('l2')}>{chan}</button></>}
      {level === 'l3' && <><span className="c-faint">/</span><span>{short(sku, 36)}</span></>}
    </nav>
  );

  // ── L1: channel overview ──
  if (level === 'l1') {
    const topSku = skuList[0];
    const chanTotals = active.map((ch) => [ch, chanTotal(dA, ch)]).sort((a, b) => b[1] - a[1]);
    const declining = skuList.filter((s) => skuTotal(dB, s) > 0 && skuTotal(dA, s) < skuTotal(dB, s)).length;
    const mix = (data, total, op) => active.map((ch) => <div key={ch} style={{ width: (total > 0 ? (chanTotal(data, ch) / total) * 100 : 0) + '%', height: '100%', background: COLORS[ch], opacity: op }} />);
    return (
      <div className="stack fade-in">
        {controls}
        <div className="grid g-kpi">
          <Kpi label={`Total ${view}`} value={fmt(totalA)} sub={`vs ${fmt(totalB)} in ${lblB}`}>
            <span className="kpi-value num">{fmt(totalA)}</span><span className="kpi-sub">vs {fmt(totalB)} in {lblB}</span><Pill now={totalA} prior={totalB} />
          </Kpi>
          <Kpi label="Top SKU" value={short(topSku, 22)} sub={`${fmt(skuTotal(dA, topSku))} · was ${fmt(skuTotal(dB, topSku))}`} />
          <Kpi label="Top channel" value={chanTotals[0]?.[0] || '—'} sub={`${fmt(chanTotals[0]?.[1])} · was ${fmt(chanTotals[0] ? chanTotal(dB, chanTotals[0][0]) : 0)}`} />
          <Kpi label="SKUs declining" value={`${declining} / ${skuList.length}`} sub="vs comparison period" />
        </div>
        <Card title="Channel overview" sub={`${lblA} vs ${lblB} · click a channel to drill in`}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
            {active.map((ch) => {
              const now = chanTotal(dA, ch), prior = chanTotal(dB, ch);
              const share = totalA > 0 ? (now / totalA) * 100 : 0;
              const best = skuList.reduce((b, s) => ((dA[ch]?.[s] || 0) > (dA[ch]?.[b] || 0) ? s : b), skuList[0]);
              const worst = skuList.filter((s) => dB[ch]?.[s] > 0).reduce((w, s) => {
                const r = (dA[ch]?.[s] || 0) / dB[ch][s];
                return !w || r < w[1] ? [s, r] : w;
              }, null);
              return (
                <button key={ch} className="card" onClick={() => { setChan(ch); go('l2'); }} style={{ textAlign: 'left', border: 0, color: 'inherit', cursor: 'pointer', background: 'var(--surface-2)', borderLeft: `3px solid ${COLORS[ch]}`, borderRadius: '4px 14px 14px 4px', boxShadow: 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div><div className="c-muted" style={{ fontSize: 12 }}><ChanDot ch={ch} />{ch}</div><div className="num" style={{ fontSize: 24, fontWeight: 600 }}>{fmt(now)}</div></div>
                    <Pill now={now} prior={prior} />
                  </div>
                  <div className="c-faint" style={{ fontSize: 12 }}>vs {fmt(prior)} in {lblB}</div>
                  <div className="bar-track" style={{ margin: '10px 0 4px' }}><div className="bar-fill" style={{ width: share + '%', background: COLORS[ch] }} /></div>
                  <div className="c-faint" style={{ fontSize: 11 }}>{share.toFixed(1)}% of total</div>
                  <div className="c-muted" style={{ fontSize: 12, marginTop: 10 }}>Top SKU <strong style={{ color: 'var(--text)' }}>{short(best, 20)}</strong> · {fmt(dA[ch]?.[best])}</div>
                  {worst && worst[1] < 1 && <div className="c-muted" style={{ fontSize: 12, marginTop: 3 }}>Biggest drop <strong className="c-bad">{short(worst[0], 16)} ▼ {Math.round((1 - worst[1]) * 100)}%</strong></div>}
                </button>
              );
            })}
          </div>
        </Card>
        <div className="grid g-1-1">
          <Card title="Channel mix" sub="Share of total by period">
            {[[lblA, totalA, mix(dA, totalA, 1)], [lblB, totalB, mix(dB, totalB, 0.55)]].map(([l, t, segs]) => (
              <div key={l} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }} className="c-muted"><span>{l}</span><span className="num">{fmt(t)}</span></div>
                <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 5, gap: 1 }}>{segs}</div>
              </div>
            ))}
            <div className="legend">{active.map((ch) => <span key={ch}><ChanDot ch={ch} />{ch}</span>)}</div>
          </Card>
          <Card title="Channel mix over time" sub="Last 6 periods">
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 110 }}>
              {trendPeriods.map((p, i) => {
                const data = bucket[p] || {};
                const grand = active.reduce((t, ch) => t + chanTotal(data, ch), 0);
                return (
                  <div key={p} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: '100%', height: 88, display: 'flex', flexDirection: 'column-reverse', gap: 1, borderRadius: 4, overflow: 'hidden', outline: i === trendPeriods.length - 1 ? '1px solid var(--accent)' : 'none' }}>
                      {active.map((ch) => <div key={ch} title={`${ch}: ${fmt(chanTotal(data, ch))}`} style={{ height: grand ? (chanTotal(data, ch) / grand) * 100 + '%' : 0, background: COLORS[ch] }} />)}
                    </div>
                    <span className="c-faint" style={{ fontSize: 10, whiteSpace: 'nowrap' }}>{periodLabel(p, mode).split(' – ')[0]}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ── L2: SKUs within one channel ──
  if (level === 'l2') {
    const now = chanTotal(dA, chan), prior = chanTotal(dB, chan);
    const rows = skuList.map((s) => ({ s, n: dA[chan]?.[s] || 0, p: dB[chan]?.[s] || 0 })).filter((r) => r.n || r.p);
    const growing = rows.filter((r) => r.p > 0 && r.n > r.p).length;
    const drop = rows.filter((r) => r.p > 0).sort((a, b) => a.n / a.p - b.n / b.p)[0];
    return (
      <div className="stack fade-in">
        {controls}{crumbs}
        <div className="grid g-kpi">
          <Kpi label={`${chan} total`}><span className="kpi-value num">{fmt(now)}</span><span className="kpi-sub">vs {fmt(prior)} in {lblB}</span><Pill now={now} prior={prior} /></Kpi>
          <Kpi label="SKUs active" value={rows.filter((r) => r.n > 0).length} sub={`of ${skuList.length} tracked`} />
          <Kpi label="SKUs growing" value={growing} sub="vs comparison period" />
          <Kpi label="Biggest drop" value={drop ? short(drop.s, 18) : '—'} sub={drop ? `${fmt(drop.n)} vs ${fmt(drop.p)}` : undefined} />
        </div>
        <Card title={`SKU performance on ${chan}`} sub={`${lblA} vs ${lblB}`}>
          <div className="table-wrap"><table>
            <thead><tr><th>SKU</th><th className="r">{lblA}</th><th className="r">{lblB}</th><th className="r">Change</th><th className="r">Share</th><th style={{ width: 100 }}>Trend</th></tr></thead>
            <tbody>{rows.map(({ s, n, p }) => (
              <tr key={s}>
                <td><button className="link-btn" title={s} onClick={() => { setSku(s); go('l3'); }}>{short(s, 34)}</button></td>
                <td className="r num" style={{ color: trendColor(n, p), fontWeight: 600 }}>{fmt(n)}</td><td className="r num c-muted">{fmt(p)}</td>
                <td className="r"><Pill now={n} prior={p} /></td><td className="r num c-faint">{now > 0 ? ((n / now) * 100).toFixed(1) : 0}%</td>
                <td><Spark values={trendPeriods.map((t) => bucket[t]?.[chan]?.[s] || 0)} color={COLORS[chan]} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        </Card>
      </div>
    );
  }

  // ── L3: one SKU across channels ──
  const nowAll = skuTotal(dA, sku), priorAll = skuTotal(dB, sku);
  const cmp = skuList.map((s) => ({ s, n: dA[chan]?.[s] || 0, p: dB[chan]?.[s] || 0 })).filter((r) => r.n || r.p);
  return (
    <div className="stack fade-in">
      {controls}{crumbs}
      <h2 className="h1" style={{ fontSize: 20 }}>{sku}</h2>
      <div className="grid g-kpi">
        <Kpi label="All channels"><span className="kpi-value num">{fmt(nowAll)}</span><span className="kpi-sub">vs {fmt(priorAll)} in {lblB}</span><Pill now={nowAll} prior={priorAll} /></Kpi>
        {active.map((ch) => {
          const n = dA[ch]?.[sku] || 0, p = dB[ch]?.[sku] || 0;
          return <Kpi key={ch} label={ch}><span className="kpi-value num" style={{ fontSize: 22 }}>{fmt(n)}</span><span className="kpi-sub">vs {fmt(p)}</span><Pill now={n} prior={p} /></Kpi>;
        })}
      </div>
      <div className="grid g-1-1">
        <Card title="By channel" sub={`${lblA} vs ${lblB}`}>
          <table>
            <thead><tr><th>Channel</th><th className="r">{lblA}</th><th className="r">{lblB}</th><th className="r">Change</th><th style={{ width: 90 }}>Share</th></tr></thead>
            <tbody>{active.map((ch) => {
              const n = dA[ch]?.[sku] || 0, p = dB[ch]?.[sku] || 0, share = nowAll > 0 ? (n / nowAll) * 100 : 0;
              return (
                <tr key={ch}><td><ChanDot ch={ch} />{ch}</td><td className="r num" style={{ color: trendColor(n, p), fontWeight: 600 }}>{fmt(n)}</td><td className="r num c-muted">{fmt(p)}</td><td className="r"><Pill now={n} prior={p} /></td>
                  <td><div className="bar-track"><div className="bar-fill" style={{ width: share + '%', background: COLORS[ch] }} /></div><span className="c-faint num" style={{ fontSize: 10 }}>{share.toFixed(1)}%</span></td></tr>
              );
            })}</tbody>
          </table>
        </Card>
        <Card title="Trend per channel" sub={`Last ${trendPeriods.length} periods`}>
          {active.map((ch) => {
            const vals = trendPeriods.map((t) => bucket[t]?.[ch]?.[sku] || 0);
            const n = vals[vals.length - 1] || 0, p = vals[vals.length - 2] || 0;
            return (
              <div key={ch} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span className="c-muted" style={{ minWidth: 64, fontSize: 12 }}><ChanDot ch={ch} />{ch}</span>
                <div style={{ flex: 1 }}><Spark values={vals} color={COLORS[ch]} /></div>
                <div style={{ textAlign: 'right', minWidth: 62 }}><div className="num" style={{ color: trendColor(n, p), fontWeight: 600, fontSize: 12 }}>{fmt(n)}</div><div className="c-faint" style={{ fontSize: 10 }}>was {fmt(p)}</div></div>
              </div>
            );
          })}
        </Card>
      </div>
      <Card title={`How this SKU compares on ${chan}`} sub={`${chan} · ${lblA} vs ${lblB}`}>
        <div className="table-wrap"><table>
          <thead><tr><th>SKU</th><th className="r">{lblA}</th><th className="r">{lblB}</th><th className="r">Change</th><th style={{ width: 130 }}>Relative to prior</th></tr></thead>
          <tbody>{cmp.map(({ s, n, p }) => {
            const ratio = p > 0 ? Math.round((n / p) * 100) : null;
            return (
              <tr key={s} style={s === sku ? { background: 'var(--surface-2)' } : undefined}>
                <td style={{ fontWeight: s === sku ? 600 : 400 }} title={s}>{short(s, 34)}{s === sku ? ' ← this SKU' : ''}</td>
                <td className="r num" style={{ color: trendColor(n, p), fontWeight: 600 }}>{fmt(n)}</td><td className="r num c-muted">{fmt(p)}</td><td className="r"><Pill now={n} prior={p} /></td>
                <td><div className="bar-track"><div className="bar-fill" style={{ width: Math.min(ratio || 0, 100) + '%', background: ratio >= 100 ? 'var(--good)' : COLORS[chan] }} /></div><span className="c-faint num" style={{ fontSize: 10 }}>{ratio != null ? ratio + '% of prior' : '—'}</span></td></tr>
            );
          })}</tbody>
        </table></div>
      </Card>
    </div>
  );
}
