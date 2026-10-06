import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, Dot, Empty, FillBar, useExpand } from '../components/ui.jsx';
import { fmtN } from '../lib/format.js';
import { CHANNEL_COLORS, CHANNEL_ORDER, chartTheme } from '../theme.js';

const axis = { tick: { fill: chartTheme.tick, fontSize: 11 }, axisLine: false, tickLine: false };
const dash = (v) => (v > 0 ? fmtN(v) : '—');
const rateOf = (v) => (v.po > 0 ? v.inv / v.po : v.inv > 0 ? 1 : 0);

export default function Inventory({ ctx }) {
  const { d, label } = ctx;
  const [open, toggle] = useExpand();

  const inv = d.daily_inv || {};
  const days = Object.keys(inv).sort();
  const active = CHANNEL_ORDER.filter((ch) => days.some((day) => inv[day]?.[ch] > 0));
  const dailyData = days.map((day) => {
    const dt = new Date(day + 'T00:00:00');
    return { name: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()] + ' ' + dt.getDate(), ...inv[day] };
  });

  const fillRows = Object.entries(d.channel_fill || {}).filter(([, v]) => v.po > 0 || v.inv > 0).sort((a, b) => b[1].inv - a[1].inv);
  const stateRows = Object.entries(d.state_fill || {}).filter(([, v]) => v.po > 0 || v.inv > 0).sort((a, b) => b[1].inv - a[1].inv);

  return (
    <div className="stack fade-in">
      <div className="grid g-2-1">
        <Card title="Daily dispatched quantities" sub={`${label} · by dispatch date, units per channel`}>
          {dailyData.length ? (
            <>
              <div className="chart-box"><ResponsiveContainer>
                <BarChart data={dailyData} margin={{ top: 8, right: 4, left: -6, bottom: 0 }}>
                  <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                  <XAxis dataKey="name" {...axis} />
                  <YAxis {...axis} tickFormatter={fmtN} />
                  <Tooltip contentStyle={chartTheme.tooltip} cursor={chartTheme.cursor} formatter={(v, n) => [fmtN(v) + ' units', n]} />
                  {active.map((ch) => <Bar isAnimationActive={false} key={ch} dataKey={ch} stackId="s" fill={CHANNEL_COLORS[ch]} />)}
                </BarChart>
              </ResponsiveContainer></div>
              <div className="legend">{active.map((ch) => <span key={ch}><Dot name={ch} />{ch}</span>)}</div>
            </>
          ) : <Empty title="No dispatches recorded" hint="Dispatch dates appear once orders ship." />}
        </Card>
        <Card title="Fill rate by channel" sub={`${label} · PO vs invoice quantity`}>
          {fillRows.length ? (
            <div className="table-wrap"><table>
              <thead><tr><th>Channel</th><th className="r">PO qty</th><th>Fill</th><th className="r">Short</th></tr></thead>
              <tbody>{fillRows.map(([ch, v]) => (
                <tr key={ch}><td><Dot name={ch} />{ch}</td><td className="r num c-muted">{dash(v.po)}</td><td><FillBar rate={v.rate} /></td><td className="r num c-warn" style={{ fontWeight: 600 }}>{dash(v.short)}</td></tr>
              ))}</tbody>
            </table></div>
          ) : <Empty title="No fill data" />}
        </Card>
      </div>

      <Card title="Fill rate by state and city" sub={`${label} · click a state to open its cities`}>
        {!stateRows.length ? <Empty title="No state fill data" hint="State is blank on most sheet rows; it is derived from Location where possible." /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>State</th><th className="r">PO qty</th><th className="r">Invoiced</th><th>Fill</th><th className="r">Short</th></tr></thead>
            <tbody>
              {stateRows.map(([state, sf]) => {
                const cities = Object.entries(d.city_fill?.[state] || {}).filter(([, v]) => v.po > 0 || v.inv > 0).sort((a, b) => b[1].inv - a[1].inv);
                return [
                  <tr key={state} className="row-btn" onClick={() => toggle(state)} aria-expanded={!!open[state]}>
                    <td style={{ fontWeight: 600 }}>{open[state] ? '▾' : '▸'} {state}</td>
                    <td className="r num c-muted">{dash(sf.po)}</td><td className="r num c-muted">{dash(sf.inv)}</td>
                    <td><FillBar rate={rateOf(sf)} /></td><td className="r num c-warn" style={{ fontWeight: 600 }}>{dash(Math.max(0, sf.po - sf.inv))}</td>
                  </tr>,
                  ...(open[state] ? cities.map(([c, cf]) => (
                    <tr key={state + c} className="sub-row">
                      <td>↳ {c}</td><td className="r num">{dash(cf.po)}</td><td className="r num">{dash(cf.inv)}</td>
                      <td><FillBar rate={rateOf(cf)} /></td><td className="r num">{dash(Math.max(0, cf.po - cf.inv))}</td>
                    </tr>
                  )) : []),
                ];
              })}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
