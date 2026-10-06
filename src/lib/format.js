export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtL(v) {
  v = Number(v) || 0;
  if (v >= 1e7) return '₹' + (v / 1e7).toFixed(2) + 'Cr';
  if (v >= 1e5) return '₹' + (v / 1e5).toFixed(1) + 'L';
  if (v >= 1e3) return '₹' + (v / 1e3).toFixed(0) + 'K';
  return '₹' + Math.round(v);
}
export const fmtN = (v) => (Number(v) || 0).toLocaleString('en-IN');
export const fmtPct = (v) => ((Number(v) || 0) * 100).toFixed(1) + '%';
export function fmtU(v) {
  if (!v) return '—';
  if (v >= 1e5) return (v / 1e5).toFixed(1) + 'L';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return Math.round(v).toLocaleString('en-IN');
}
export const short = (s, n = 28) => (!s ? '—' : s.length > n ? s.slice(0, n - 1) + '…' : s);

// Period keys: weekly/daily are ISO dates (Monday start for weekly), monthly is "Oct 2026".
export function periodLabel(key, mode) {
  if (mode === 'monthly' || mode === 'mtd' || mode === 'custom') return key;
  const d = new Date(key + 'T00:00:00');
  if (isNaN(d)) return key;
  if (mode === 'daily') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const e = new Date(d);
  e.setDate(e.getDate() + 6);
  return `${MONTHS[d.getMonth()]} ${d.getDate()} – ${MONTHS[e.getMonth()]} ${e.getDate()}`;
}

export function monthKeySort(a, b) {
  const [aM, aY] = a.split(' ');
  const [bM, bY] = b.split(' ');
  return parseInt(aY) - parseInt(bY) || MONTHS.indexOf(aM) - MONTHS.indexOf(bM);
}
export const isMonthKey = (k) => {
  const p = k.split(' ');
  return p.length === 2 && MONTHS.includes(p[0]) && parseInt(p[1]) > 2000;
};

// Health bands used across the app: returns 'good' | 'warn' | 'bad'
export const band = (v, good, warn, higherBetter = true) =>
  higherBetter ? (v >= good ? 'good' : v >= warn ? 'warn' : 'bad') : v <= good ? 'good' : v <= warn ? 'warn' : 'bad';
