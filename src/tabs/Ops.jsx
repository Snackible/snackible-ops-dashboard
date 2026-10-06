import { Badge, Card, Empty, Kpi } from '../components/ui.jsx';
import { band, fmtN } from '../lib/format.js';
import { STATUS_ORDER, STATUS_TONE } from '../theme.js';

const days = (v) => (v > 0 ? v + 'd' : '—');
const tone = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)' };

function TatTable({ obj, nameLabel, limit }) {
  const rows = Object.entries(obj || {}).sort((a, b) => b[1].orders - a[1].orders).slice(0, limit || 99);
  if (!rows.length) return <Empty title="No data for this period" />;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>{nameLabel}</th><th className="r">Orders</th><th className="r">PO→Disp</th><th className="r">Disp→Del</th><th className="r">PO→Del</th></tr></thead>
      <tbody>
        {rows.map(([name, c]) => {
          const p = band(c.avg_proc_tat, 2, 5, false), t = band(c.avg_tran_tat, 5, 8, false);
          const total = c.avg_total_tat ? band(c.avg_total_tat, 7, 10, false) : 'warn';
          return (
            <tr key={name}>
              <td style={{ fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</td>
              <td className="r num c-muted">{fmtN(c.orders)}</td>
              <td className="r num" style={{ color: c.avg_proc_tat ? tone[p] : undefined }}>{days(c.avg_proc_tat)}</td>
              <td className="r num" style={{ color: c.avg_tran_tat ? tone[t] : undefined }}>{days(c.avg_tran_tat)}</td>
              <td className="r"><Badge tone={c.avg_total_tat ? total : 'neutral'}>{days(c.avg_total_tat)}</Badge></td>
            </tr>
          );
        })}
      </tbody>
    </table></div>
  );
}

export default function Ops({ ctx }) {
  const { d, label } = ctx;
  const proc = d.avg_proc_tat || 0, tran = d.avg_tran_tat || 0, total = d.avg_total_tat || 0, rto = d.rto_pct || 0;
  const bt = (v, g, w) => (v > 0 ? { tone: band(v, g, w, false), text: band(v, g, w, false) === 'good' ? 'Fast' : band(v, g, w, false) === 'warn' ? 'Moderate' : 'Slow' } : { tone: 'neutral', text: 'No data' });

  const statuses = d.statuses || {};
  const totalOrders = Object.values(statuses).reduce((a, b) => a + b, 0);
  const delivered = statuses.Delivered || 0;
  const dr = totalOrders ? delivered / totalOrders : 0;
  const order = [...new Set([...STATUS_ORDER, ...Object.keys(statuses)])].filter((s) => statuses[s]);

  return (
    <div className="stack fade-in">
      <div className="grid g-kpi">
        <Kpi label="PO to dispatch" value={days(proc)} badge={bt(proc, 3, 7)} />
        <Kpi label="Dispatch to delivery" value={days(tran)} badge={bt(tran, 5, 10)} />
        <Kpi label="PO to delivery" value={days(total)} badge={bt(total, 7, 12)} />
        <Kpi label="RTO rate" value={rto + '%'} badge={{ tone: rto <= 3 ? 'good' : 'warn', text: rto === 0 ? 'No RTOs' : rto <= 3 ? 'Acceptable' : 'High' }} />
      </div>
      <div className="grid g-1-1">
        <Card title="Order status" sub={`${label} · ${fmtN(totalOrders)} total`}>
          {order.length ? (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
                <span className="num" style={{ fontSize: 34, fontWeight: 600, letterSpacing: '-0.04em' }}>{(dr * 100).toFixed(1)}%</span>
                <span className="c-muted">delivered</span>
              </div>
              <div className="bar-track" style={{ height: 6, marginBottom: 14 }}>
                <div className="bar-fill" style={{ width: dr * 100 + '%', background: tone[band(dr, 0.8, 0.6)] }} />
              </div>
              <table><tbody>
                {order.map((s) => (
                  <tr key={s}>
                    <td><Badge tone={STATUS_TONE[s] === 'info' ? 'neutral' : STATUS_TONE[s] || 'neutral'}>{s}</Badge></td>
                    <td className="r num" style={{ fontWeight: 600 }}>{fmtN(statuses[s])}</td>
                    <td className="r num c-faint" style={{ width: 70 }}>{((statuses[s] / totalOrders) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody></table>
            </>
          ) : <Empty title="No orders in this period" />}
        </Card>
        <Card title="Courier TAT" sub={`${label} · three-stage breakdown`}><TatTable obj={d.couriers} nameLabel="Partner" /></Card>
      </div>
      <div className="grid g-1-1">
        <Card title="TAT by channel" sub="Three-stage breakdown"><TatTable obj={d.channel_tat} nameLabel="Channel" /></Card>
        <Card title="TAT by state" sub="Top 15 states by orders"><TatTable obj={d.state_tat} nameLabel="State" limit={15} /></Card>
      </div>
    </div>
  );
}
