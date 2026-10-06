// Builds the JSON that GET /api/metrics returns. Pure functions over the output of aggregate.js, so the
// numbers are exactly the ones the dashboard shows. All dates are UTC.
import { buildRange } from './aggregate.js';
import { MONTHS, isMonthKey, monthKeySort } from './format.js';

export const PERIOD_TYPES = ['daily', 'weekly', 'monthly', 'mtd', 'custom'];

const DAY = 864e5;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const pct = (a, b) => (b > 0 ? r1((a / b) * 100) : null);
const iso = (d) => d.toISOString().slice(0, 10);
const isIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z'));
const orNull = (v) => (v > 0 ? v : null); // 0 means "no data" for averages

export function kpisOf(b) {
  const statusTotal = Object.values(b.statuses || {}).reduce((s, v) => s + v, 0);
  const channelNames = new Set([...Object.keys(b.channels || {}), ...Object.keys(b.channel_fill || {})]);
  const channels = [...channelNames]
    .map((channel) => {
      const f = b.channel_fill?.[channel] || { po: 0, inv: 0 };
      return {
        channel,
        gmv: r2(b.channels?.[channel] || 0),
        po_qty: f.po || 0,
        invoiced_qty: f.inv || 0,
        fill_pct: f.po > 0 ? r1(Math.min(f.inv / f.po, 1) * 100) : null, // null when the channel has no PO quantity
      };
    })
    .sort((a, b2) => b2.gmv - a.gmv);
  const topStates = Object.entries(b.locations || {})
    .filter(([, v]) => v > 0)
    .sort((a, b2) => b2[1] - a[1])
    .slice(0, 5)
    .map(([state, gmv]) => ({ state, gmv: r2(gmv) }));
  return {
    orders: b.orders,
    gmv: r2(b.gmv),
    order_value: r2(b.total_order_val || 0),
    fill_pct: b.avg_fill,
    value_fulfilment_pct: b.total_order_val > 0 ? r1(Math.min(b.total_inv_val / b.total_order_val, 1) * 100) : null,
    rto_pct: b.rto_pct,
    dn_value: r2(b.dn_value || 0),
    delivered_pct: pct(b.statuses?.Delivered || 0, statusTotal),
    tat_days: { po_to_dispatch: orNull(b.avg_proc_tat), dispatch_to_delivery: orNull(b.avg_tran_tat), po_to_delivery: orNull(b.avg_total_tat) },
    statuses: b.statuses || {},
    channels,
    top_states: topStates,
  };
}

const coreOf = (k) => ({ orders: k.orders, gmv: k.gmv, fill_pct: k.fill_pct, rto_pct: k.rto_pct });

// Keys with at least one order, newest first. Monthly keys are sorted by calendar, not alphabetically.
export function periodKeys(td, type) {
  const keys = Object.keys(td[type] || {}).filter((k) => td[type][k].orders > 0);
  return type === 'monthly' ? keys.filter(isMonthKey).sort((a, b) => monthKeySort(b, a)) : keys.sort().reverse();
}

// Be forgiving about what callers send: any date inside a week selects that week; "2026-09" selects Sep 2026.
export function normaliseKey(type, raw) {
  const key = String(raw).trim().replace(/\+/g, ' ');
  if (type === 'weekly' && isIsoDate(key)) {
    const d = new Date(key + 'T00:00:00Z');
    return iso(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY));
  }
  if (type === 'monthly') {
    const m = key.match(/^(\d{4})-(\d{2})$/);
    if (m && +m[2] >= 1 && +m[2] <= 12) return `${MONTHS[+m[2] - 1]} ${m[1]}`;
    const t = key.match(/^([A-Za-z]{3})[a-z]*\s+(\d{4})$/); // "Sep 2026", "September 2026"
    if (t) return `${t[1].charAt(0).toUpperCase()}${t[1].slice(1).toLowerCase()} ${t[2]}`;
  }
  return key;
}

function weekSpan(key) {
  const start = new Date(key + 'T00:00:00Z');
  return { start: key, end: iso(new Date(start.getTime() + 6 * DAY)) };
}

// query: { period, key, start, end, detail }. now: Date (injected for testing).
// Returns { status, body } where body excludes `meta` (the route adds that).
export function buildPayload(td, query = {}, now = new Date()) {
  const { period, key, start, end, detail } = query;
  const full = detail === 'full';

  if (!period) {
    // Index: what periods exist and a one-line summary of the latest of each type.
    const out = { periods: {}, latest: {} };
    ['monthly', 'weekly', 'daily'].forEach((type) => {
      const keys = periodKeys(td, type);
      out.periods[type] = keys;
      if (keys[0]) out.latest[type] = { key: keys[0], ...(type === 'weekly' ? weekSpan(keys[0]) : {}), kpis: coreOf(kpisOf(td[type][keys[0]])) };
    });
    return { status: 200, body: out };
  }

  if (!PERIOD_TYPES.includes(period)) {
    return { status: 400, body: { error: `Unknown period "${period}".`, allowed: PERIOD_TYPES } };
  }

  if (period === 'mtd' || period === 'custom') {
    let s, e;
    if (period === 'mtd') {
      s = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
      e = iso(now);
    } else {
      if (!isIsoDate(start || '') || !isIsoDate(end || '')) {
        return { status: 400, body: { error: 'period=custom needs start and end as YYYY-MM-DD.' } };
      }
      if (start > end) return { status: 400, body: { error: 'start must be on or before end.' } };
      if ((new Date(end) - new Date(start)) / DAY > 400) return { status: 400, body: { error: 'Range is limited to 400 days.' } };
      s = start; e = end;
    }
    const block = buildRange(td.rows, s, e);
    return {
      status: 200,
      body: { period: { type: period, start: s, end: e }, kpis: kpisOf(block), ...(full ? { block } : {}) },
    };
  }

  const keys = periodKeys(td, period);
  if (!keys.length) return { status: 404, body: { error: `No ${period} data.` } };
  const k = key ? normaliseKey(period, key) : keys[0];
  if (!td[period][k]) {
    return { status: 404, body: { error: `No ${period} period "${key}".`, available: keys.slice(0, 24) } };
  }
  const block = td[period][k];
  const kpis = kpisOf(block);
  const i = keys.indexOf(k);
  const prevKey = keys[i + 1];
  const prev = prevKey ? kpisOf(td[period][prevKey]) : null;
  return {
    status: 200,
    body: {
      period: { type: period, key: k, ...(period === 'weekly' ? weekSpan(k) : {}), is_latest: i === 0 },
      kpis,
      previous: prev ? { key: prevKey, kpis: coreOf(prev) } : null,
      change_pct: prev ? { gmv: pct(kpis.gmv - prev.gmv, prev.gmv), orders: pct(kpis.orders - prev.orders, prev.orders) } : null,
      ...(full ? { block } : {}),
    },
  };
}
