// Turns the raw Google Sheets "values" grid into clean order rows. Pure: no browser or config imports,
// so the same code runs in the dashboard and in the /api/metrics function.
import { normChannel, normStatus, deriveState, deriveCity } from './normalize.js';

const num = (v) => {
  if (v === '' || v == null) return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[,₹\s]/g, ''));
  return isNaN(n) ? 0 : n;
};

// Accepts Sheets serial numbers or dd-mm-yyyy / dd/mm/yyyy strings. Returns a UTC midnight Date or null.
export function parseDate(v) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return v > 30000 && v < 80000 ? new Date(Date.UTC(1899, 11, 30) + v * 864e5) : null;
  const m = String(v).trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!m) return null;
  let y = +m[3];
  if (y < 100) y += 2000;
  if (y < 2000 || y > 2100) return null; // e.g. "04-06-0206" typos in the sheet
  const d = new Date(Date.UTC(y, +m[2] - 1, +m[1]));
  return isNaN(d) ? null : d;
}

// PO dates after today (e.g. a mistyped month) or before 2024 are treated as missing so they don't create
// phantom weeks or months. Those rows fall out of the period views and are counted in rows.issues.
// A day and a half of slack covers time zones.
function sanePoDate(d, issues) {
  if (!d) return null;
  const t = d.getTime();
  if (t > Date.now() + 36 * 36e5) { issues.futurePo += 1; return null; }
  return t < Date.UTC(2024, 0, 1) ? null : d;
}

// Headers are matched by cleaned name so column order changes in the sheet don't break anything.
export function toRows(values) {
  if (!values.length) return [];
  const header = values[0].map((h) => String(h ?? '').replace(/\s+/g, ' ').trim());
  const idx = {};
  header.forEach((h, i) => {
    if (!(h.toLowerCase() in idx)) idx[h.toLowerCase()] = i;
  });
  const col = (name) => idx[name.toLowerCase()];
  const c = {
    ref: col('Ref No'), poDate: col('PO Date'), po: col('PO'), channel: col('Channel'),
    location: col('Location'), state: col('State'), orderValue: col('Order Value'), poQty: col('PO Qty'),
    invQty: col('Invoice Qty'), invValue: col('Invoice Value'), actDispatch: col('Act Dispatch'),
    courier: col('Courier'), actDel: col('Act Del'), status: col('STATUS'), dnValue: col('DN Value'),
  };
  const wIdx = header.findIndex((h) => h.toLowerCase() === 'total weight');
  const skuCols = wIdx >= 0 ? header.map((h, i) => [h, i]).filter(([h, i]) => i > wIdx && h) : [];

  const rows = [];
  const issues = { futurePo: 0 };
  for (let r = 1; r < values.length; r++) {
    const v = values[r];
    const g = (k) => (c[k] == null ? '' : v[c[k]]);
    const ref = String(g('ref') ?? '').trim();
    if (!ref) continue; // blank padding rows
    const location = String(g('location') ?? '').trim();
    const skus = {};
    skuCols.forEach(([name, i]) => {
      const q = num(v[i]);
      if (q > 0) skus[name] = q;
    });
    rows.push({
      ref,
      po: String(g('po') ?? '').trim(),
      channel: normChannel(g('channel')),
      location,
      city: deriveCity(location),
      state: deriveState(g('state'), location),
      poDate: sanePoDate(parseDate(g('poDate')), issues),
      actDispatch: parseDate(g('actDispatch')),
      actDel: parseDate(g('actDel')),
      orderValue: num(g('orderValue')),
      poQty: num(g('poQty')),
      invQty: num(g('invQty')),
      invValue: num(g('invValue')),
      dnValue: num(g('dnValue')),
      courier: String(g('courier') ?? '').trim(),
      status: normStatus(g('status')),
      skus,
    });
  }
  rows.issues = issues;
  return rows;
}
