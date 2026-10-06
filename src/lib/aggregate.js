// Turns normalised sheet rows into the same block shape the Apps Script returns, so every tab
// works against either data source. Definitions here are our best reading of the dashboard:
//   gmv = Σ Invoice Value, orders = rows excluding Duplicate, fill = Σ Invoice Qty / Σ PO Qty,
//   PO→Disp = Act Dispatch − PO Date, Disp→Del = Act Del − Act Dispatch, PO→Del = Act Del − PO Date.
// Validate the numbers against the Apps Script output before switching DATA_SOURCE to 'sheets'.
import { MONTHS } from './format.js';
import { platformOf } from './normalize.js';

const DAY = 864e5;
const isoDay = (d) => d.toISOString().slice(0, 10);
const weekKey = (d) => isoDay(new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY));
const monthKey = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const ddmmyyyy = (d) => `${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`;
const add = (o, k, v) => { o[k] = (o[k] || 0) + v; };
const nested = (o, k) => (o[k] ||= {});
const round1 = (v) => Math.round(v * 10) / 10;
const days = (a, b) => (a && b ? (b - a) / DAY : null);
const avg = (arr) => (arr.length ? round1(arr.reduce((s, x) => s + x, 0) / arr.length) : 0);

function tatStats(rows) {
  const proc = [], tran = [], total = [];
  rows.forEach((r) => {
    const p = days(r.poDate, r.actDispatch), t = days(r.actDispatch, r.actDel), a = days(r.poDate, r.actDel);
    if (p != null && p >= 0) proc.push(p);
    if (t != null && t >= 0) tran.push(t);
    if (a != null && a >= 0) total.push(a);
  });
  return {
    orders: rows.length,
    avg_proc_tat: avg(proc), avg_tran_tat: avg(tran), avg_total_tat: avg(total),
    avg_tat: avg(total),
    on_time_pct: total.length ? round1((total.filter((x) => x <= 7).length / total.length) * 100) : 0,
  };
}
function groupTat(rows, keyFn) {
  const g = {};
  rows.forEach((r) => { const k = keyFn(r); if (k) (g[k] ||= []).push(r); });
  return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, tatStats(v)]));
}

export function buildBlock(all) {
  const rows = all.filter((r) => r.status !== 'Duplicate');
  const b = {
    orders: rows.length, gmv: 0, statuses: {}, channels: {}, channel_fill: {}, channel_val: {}, channel_sku: {},
    daily_inv: {}, order_types: {}, locations: {}, cities: {}, skus: {}, state_sku: {}, city_sku: {}, city_gmv: {},
    state_fill: {}, city_fill: {}, total_order_val: 0, total_inv_val: 0, dn_value: 0,
  };
  all.forEach((r) => add(b.statuses, r.status || 'Other', 1));

  let po = 0, inv = 0;
  rows.forEach((r) => {
    const ch = r.channel || 'Others';
    b.gmv += r.invValue;
    b.total_order_val += r.orderValue;
    b.total_inv_val += r.invValue;
    b.dn_value += r.dnValue;
    po += r.poQty; inv += r.invQty;
    add(b.channels, ch, r.invValue);
    const cf = nested(b.channel_fill, ch); cf.po = (cf.po || 0) + r.poQty; cf.inv = (cf.inv || 0) + r.invQty;
    const cv = nested(b.channel_val, ch); cv.po_val = (cv.po_val || 0) + r.orderValue; cv.inv_val = (cv.inv_val || 0) + r.invValue;
    add(b.order_types, platformOf(ch), r.invValue);
    if (r.actDispatch && r.invQty > 0) add(nested(b.daily_inv, isoDay(r.actDispatch)), ch, r.invQty);

    const st = r.state || 'Unmapped', city = r.city || 'Unknown';
    add(b.locations, st, r.invValue);
    add(b.cities, city, r.invValue);
    add(nested(b.city_gmv, st), city, r.invValue);
    const sf = nested(b.state_fill, st); sf.po = (sf.po || 0) + r.poQty; sf.inv = (sf.inv || 0) + r.invQty;
    const cfc = nested(nested(b.city_fill, st), city); cfc.po = (cfc.po || 0) + r.poQty; cfc.inv = (cfc.inv || 0) + r.invQty;

    Object.entries(r.skus).forEach(([sku, q]) => {
      add(b.skus, sku, q);
      add(nested(b.state_sku, st), sku, q);
      add(nested(nested(b.city_sku, st), city), sku, q);
      add(nested(b.channel_sku, ch), sku, q);
    });
  });
  Object.values(b.channel_fill).forEach((v) => {
    v.rate = v.po > 0 ? v.inv / v.po : 0;
    v.short = Math.max(0, v.po - v.inv);
  });
  Object.values(b.channel_val).forEach((v) => { v.rate = v.po_val > 0 ? v.inv_val / v.po_val : 0; });

  const t = tatStats(rows);
  b.avg_fill = po > 0 ? round1(Math.min(inv / po, 1) * 100) : 0;
  b.avg_proc_tat = t.avg_proc_tat; b.avg_tran_tat = t.avg_tran_tat; b.avg_total_tat = t.avg_total_tat;
  b.rto_pct = rows.length ? round1(((b.statuses.RTO || 0) / rows.length) * 100) : 0;
  b.couriers = groupTat(rows, (r) => r.courier);
  b.channel_tat = groupTat(rows, (r) => r.channel);
  b.state_tat = groupTat(rows, (r) => r.state);
  return b;
}

function deliveredLog(rows) {
  return rows
    .filter((r) => r.status === 'Delivered' && r.actDel)
    .map((r) => ({
      po_date: r.poDate ? ddmmyyyy(r.poDate) : '', date: ddmmyyyy(r.actDel), ref: r.ref, po: r.po,
      channel: r.channel, val: r.invValue, _time: r.actDel.getTime(),
    }))
    .sort((a, b) => b._time - a._time);
}

const SKU_CH = { 'Hot - Blinkit': 'Blinkit', 'KK - Zepto': 'Zepto', 'Scootsy - Swiggy': 'Swiggy', BB: 'BB', Amazon: 'Amazon' };

function skuAnalysis(rows) {
  const out = { weekly: {}, monthly: {}, weekly_value: {}, monthly_value: {} };
  const totals = {};
  rows.forEach((r) => {
    const ch = SKU_CH[r.channel];
    if (!ch || !r.poDate) return;
    const units = Object.values(r.skus).reduce((s, x) => s + x, 0);
    Object.entries(r.skus).forEach(([sku, q]) => {
      add(totals, sku, q);
      const val = units > 0 ? (r.orderValue * q) / units : 0; // order value split by unit share
      [['weekly', weekKey(r.poDate)], ['monthly', monthKey(r.poDate)]].forEach(([m, k]) => {
        add(nested(nested(out[m], k), ch), sku, q);
        add(nested(nested(out[m + '_value'], k), ch), sku, val);
      });
    });
  });
  out.sku_list = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([s]) => s);
  return out;
}

export function buildTimeData(rows) {
  const dated = rows.filter((r) => r.poDate);
  const groups = { daily: {}, weekly: {}, monthly: {} };
  dated.forEach((r) => {
    (groups.daily[isoDay(r.poDate)] ||= []).push(r);
    (groups.weekly[weekKey(r.poDate)] ||= []).push(r);
    (groups.monthly[monthKey(r.poDate)] ||= []).push(r);
  });
  const td = { rows, shopify: null, delivered_log: deliveredLog(rows), sku_analysis: skuAnalysis(dated) };
  Object.entries(groups).forEach(([mode, g]) => {
    td[mode] = Object.fromEntries(Object.entries(g).map(([k, v]) => [k, buildBlock(v)]));
  });
  return td;
}

// start/end are 'YYYY-MM-DD', inclusive, by PO date.
export function buildRange(rows, start, end) {
  const s = new Date(start + 'T00:00:00Z').getTime(), e = new Date(end + 'T00:00:00Z').getTime();
  return buildBlock(rows.filter((r) => r.poDate && r.poDate.getTime() >= s && r.poDate.getTime() <= e));
}
