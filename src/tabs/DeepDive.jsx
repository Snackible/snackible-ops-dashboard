import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Dot, Empty, useExpand } from '../components/ui.jsx';
import { fmtL, fmtN, short } from '../lib/format.js';
import { PLATFORM_COLORS, chartTheme } from '../theme.js';

const sumVals = (o) => Object.values(o || {}).reduce((s, v) => s + v, 0);
const axis = { tick: { fill: chartTheme.tick, fontSize: 11 }, axisLine: false, tickLine: false };

function TopBars({ entries, color, empty }) {
  if (!entries.length) return <Empty title={empty} />;
  const data = entries.map(([name, v]) => ({ name, v }));
  return (
    <div className="chart-box"><ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="2 7" stroke={chartTheme.grid} horizontal={false} />
        <XAxis type="number" {...axis} tickFormatter={fmtL} />
        <YAxis type="category" dataKey="name" width={80} {...axis} />
        <Tooltip contentStyle={chartTheme.tooltip} cursor={chartTheme.cursor} formatter={(v) => fmtL(v)} />
        <Bar isAnimationActive={false} dataKey="v" fill={color} radius={[0, 6, 6, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer></div>
  );
}

export default function DeepDive({ ctx }) {
  const { d, label } = ctx;
  const [open, toggle] = useExpand();

  const types = Object.entries(d.order_types || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, v }));
  const states = Object.entries(d.locations || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const cities = Object.entries(d.cities || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const skus = Object.entries(d.skus || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top5 = skus.slice(0, 5).map((e) => e[0]);
  const stateRows = Object.entries(d.state_sku || {}).sort((a, b) => sumVals(b[1]) - sumVals(a[1])).slice(0, 10);
  const chanRows = Object.entries(d.channel_sku || {}).sort((a, b) => sumVals(b[1]) - sumVals(a[1]));
  const cell = (v) => (v ? <span className="matrix-cell-hi">{fmtN(v)}</span> : <span className="c-faint">—</span>);
  const heads = top5.map((s) => <th key={s} className="r" title={s}>{short(s, 14)}</th>);

  return (
    <div className="stack fade-in">
      <div className="grid g-3">
        <Card title="Revenue by platform" sub={`${label} · invoice value`}>
          {types.length ? (
            <>
              <div className="chart-box"><ResponsiveContainer>
                <PieChart>
                  <Pie isAnimationActive={false} data={types} dataKey="v" nameKey="name" innerRadius="62%" outerRadius="88%" paddingAngle={2} stroke="none">
                    {types.map((t) => <Cell key={t.name} fill={PLATFORM_COLORS[t.name] || PLATFORM_COLORS.Other} />)}
                  </Pie>
                  <Tooltip contentStyle={chartTheme.tooltip} formatter={(v) => fmtL(v)} />
                </PieChart>
              </ResponsiveContainer></div>
              <div className="legend">{types.map((t) => <span key={t.name}><Dot name={t.name} />{t.name} {fmtL(t.v)}</span>)}</div>
            </>
          ) : <Empty title="No revenue yet" />}
        </Card>
        <Card title="Top states" sub="By GMV"><TopBars entries={states} color="#E2B14A" empty="No state data" /></Card>
        <Card title="Top cities" sub="By GMV"><TopBars entries={cities} color="#4FB59E" empty="No city data" /></Card>
      </div>

      <div className="grid g-2-1">
        <Card title="State × top SKUs" sub="Units ordered. Click a state to see its cities.">
          {!stateRows.length || !top5.length ? <Empty title="No regional SKU data" hint="SKU quantities are blank for this period." /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>State</th><th className="r">GMV</th>{heads}</tr></thead>
              <tbody>
                {stateRows.map(([state, sk]) => {
                  const cities = Object.entries(d.city_sku?.[state] || {}).sort((a, b) => sumVals(b[1]) - sumVals(a[1]));
                  return [
                    <tr key={state} className="row-btn" onClick={() => toggle(state)} aria-expanded={!!open[state]}>
                      <td style={{ fontWeight: 600 }}>{open[state] ? '▾' : '▸'} {state}</td>
                      <td className="r num c-warn">{fmtL(d.locations?.[state] || 0)}</td>
                      {top5.map((s) => <td key={s} className="r num">{cell(sk[s])}</td>)}
                    </tr>,
                    ...(open[state] ? cities.map(([c, cs]) => (
                      <tr key={state + c} className="sub-row">
                        <td>↳ {c}</td><td className="r num">{fmtL(d.city_gmv?.[state]?.[c] || 0)}</td>
                        {top5.map((s) => <td key={s} className="r num">{cell(cs[s])}</td>)}
                      </tr>
                    )) : []),
                  ];
                })}
              </tbody>
            </table></div>
          )}
        </Card>
        <Card title="SKU volume" sub="Units ordered per SKU">
          {skus.length ? (
            <div className="table-wrap scroll-y"><table><tbody>
              {skus.map(([n, q]) => <tr key={n}><td style={{ whiteSpace: 'normal', fontSize: 12 }}>{n}</td><td className="r num c-warn">{fmtN(q)}</td></tr>)}
            </tbody></table></div>
          ) : <Empty title="No SKU quantities" hint="About 15% of orders in the sheet have no SKU split." />}
        </Card>
      </div>

      <Card title="Channel × top SKUs" sub="Units ordered">
        {!chanRows.length ? <Empty title="No channel SKU data" /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Channel</th>{heads}<th className="r">Total units</th></tr></thead>
            <tbody>
              {chanRows.map(([ch, sk]) => (
                <tr key={ch}><td style={{ fontWeight: 600 }}><Dot name={ch} />{ch}</td>
                  {top5.map((s) => <td key={s} className="r num">{cell(sk[s])}</td>)}
                  <td className="r num c-warn" style={{ fontWeight: 600 }}>{fmtN(sumVals(sk))}</td></tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
